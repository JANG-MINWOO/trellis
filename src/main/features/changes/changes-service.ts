// Computes what changed, from git — never from hook events, so edits made through Bash count too.
// Snapshots use a temporary index + `git write-tree`: the working tree, the real index and refs are
// untouched; only unreferenced objects land in .git/objects and git gc cleans them (ADR-0014).
import { randomUUID } from 'node:crypto'
import { existsSync, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { groupByArea } from '@shared/areas'
import type { Baseline, ChangeReport } from '@shared/types'
import { readJson, writeJsonAtomic } from '../../lib/json-file'
import { KeyedSerialQueue } from '../../lib/serial'
import { EMPTY_TREE, Git } from './git'
import { combineChanges } from './git-parse'

const LARGE_UNTRACKED_BYTES = 20 * 1024 * 1024
const MAX_EXCLUDES = 200

export interface RepoInfo {
  top: string
  /** Project folder relative to the repository root, forward slashes; '' at the root. */
  prefix: string
}

interface StoredBaseline {
  tree: string
  takenAt: number
}

export class ChangesService {
  private readonly queue = new KeyedSerialQueue()

  constructor(
    /** Resolves once the login-shell environment (and with it git's location) is known. */
    private readonly git: () => Promise<Git | null>,
    private readonly projectsDir: string,
  ) {}

  async repoInfo(root: string): Promise<RepoInfo | null> {
    const git = await this.git()
    if (!git) return null
    const top = (await git.tryRun(root, ['rev-parse', '--show-toplevel']))?.trim()
    if (!top) return null
    const prefix =
      (await git.tryRun(root, ['rev-parse', '--show-prefix']))?.trim().replace(/\/$/, '') ?? ''
    return { top: path.resolve(top), prefix }
  }

  private baselineFile(projectId: string): string {
    return path.join(this.projectsDir, projectId, 'baseline.json')
  }

  /**
   * Records "now" as the session baseline (called right before Claude starts). Not queued behind
   * get(): each snapshot uses its own temporary index, so running them side by side is safe, and
   * waiting here would delay the launch.
   */
  async snapshotSession(projectId: string, root: string): Promise<void> {
    const info = await this.repoInfo(root)
    if (!info) return
    const takenAt = Date.now()
    const tree = await this.snapshotTree(info)
    const stored: StoredBaseline = { tree, takenAt }
    await writeJsonAtomic(this.baselineFile(projectId), stored)
  }

  get(projectId: string, root: string, baseline: Baseline): Promise<ChangeReport> {
    return this.queue.run(projectId, async () => {
      const git = await this.git()
      if (!git) return { kind: 'error', message: 'git-not-found' }
      try {
        const info = await this.repoInfo(root)
        if (!info) return { kind: 'not-repo' }
        const current = await this.snapshotTree(info)
        let base: string | null = null
        let takenAt: number | null = null
        let fallback = false
        if (baseline === 'session') {
          const stored = await readJson<StoredBaseline | null>(this.baselineFile(projectId), null)
          if (
            stored &&
            (await git.tryRun(info.top, ['cat-file', '-e', `${stored.tree}^{tree}`])) !== null
          ) {
            base = stored.tree
            takenAt = stored.takenAt
          } else {
            fallback = true
          }
        }
        base ??=
          (await git.tryRun(info.top, ['rev-parse', '--verify', '-q', 'HEAD^{tree}']))?.trim() ||
          EMPTY_TREE

        const pathspec = info.prefix ? ['--', info.prefix] : []
        const [nameStatus, numstat] = await Promise.all([
          git.run(info.top, [
            'diff-tree',
            '-r',
            '-z',
            '--name-status',
            '-M',
            base,
            current,
            ...pathspec,
          ]),
          git.run(info.top, [
            'diff-tree',
            '-r',
            '-z',
            '--numstat',
            '-M',
            base,
            current,
            ...pathspec,
          ]),
        ])
        const entries = combineChanges(nameStatus, numstat, info.prefix)
        const branch =
          (await git.tryRun(info.top, ['symbolic-ref', '--short', '-q', 'HEAD']))?.trim() ||
          (await git.tryRun(info.top, ['rev-parse', '--short', 'HEAD']))?.trim() ||
          null
        return {
          kind: 'ok',
          baseline,
          baselineFallback: fallback,
          baselineTakenAt: takenAt,
          branch,
          groups: groupByArea(entries),
          totals: {
            files: entries.length,
            additions: entries.reduce((n, e) => n + e.additions, 0),
            deletions: entries.reduce((n, e) => n + e.deletions, 0),
          },
          computedAt: Date.now(),
        }
      } catch (error) {
        return { kind: 'error', message: (error as Error).message }
      }
    })
  }

  async initRepo(root: string): Promise<{ ok: boolean; message?: string }> {
    const git = await this.git()
    if (!git) return { ok: false, message: 'git-not-found' }
    try {
      await git.run(root, ['init'])
      return { ok: true }
    } catch (error) {
      return { ok: false, message: (error as Error).message }
    }
  }

  /** Tree object of the working tree as it is right now (tracked + untracked, honoring .gitignore). */
  private async snapshotTree(info: RepoInfo): Promise<string> {
    const git = (await this.git())!
    const realIndex = path.resolve(
      info.top,
      (await git.run(info.top, ['rev-parse', '--git-path', 'index'])).trim(),
    )
    const tmpIndex = path.join(os.tmpdir(), `trellis-index-${randomUUID()}`)
    try {
      // Seeding from the real index keeps git's stat cache, so unchanged files are not re-hashed.
      if (existsSync(realIndex)) await fs.copyFile(realIndex, tmpIndex)
      const env = { GIT_INDEX_FILE: tmpIndex }
      const scope = info.prefix || '.'
      const excludes = await this.largeUntracked(info, scope)
      await git.run(
        info.top,
        ['add', '-A', '--', scope, ...excludes.map((p) => `:(exclude,literal)${p}`)],
        {
          env,
          timeoutMs: 120_000,
        },
      )
      return (await git.run(info.top, ['write-tree'], { env })).trim()
    } finally {
      await fs.rm(tmpIndex, { force: true })
      await fs.rm(`${tmpIndex}.lock`, { force: true })
    }
  }

  /** Huge untracked files (datasets, build output that is not ignored) would bloat .git/objects. */
  private async largeUntracked(info: RepoInfo, scope: string): Promise<string[]> {
    const git = (await this.git())!
    const out = await git.tryRun(info.top, [
      'ls-files',
      '-z',
      '--others',
      '--exclude-standard',
      '--',
      scope,
    ])
    if (!out) return []
    const large: string[] = []
    for (const rel of out.split('\0')) {
      if (!rel || large.length >= MAX_EXCLUDES) continue
      try {
        const stat = await fs.stat(path.join(info.top, rel))
        if (stat.size > LARGE_UNTRACKED_BYTES) large.push(rel)
      } catch {
        // vanished between listing and stat
      }
    }
    return large
  }
}
