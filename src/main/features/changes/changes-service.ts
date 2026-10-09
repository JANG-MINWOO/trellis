// Computes what changed, from git — never from hook events, so edits made through Bash count too.
// Snapshots use a temporary index + `git write-tree`: the working tree, the real index and refs are
// untouched; only unreferenced objects land in .git/objects and git gc cleans them (ADR-0014).
import { randomUUID } from 'node:crypto'
import { existsSync, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { groupByArea } from '@shared/areas'
import type { Baseline, ChangeEntry, ChangeReport } from '@shared/types'
import { readJson, writeJsonAtomic } from '../../lib/json-file'
import { KeyedSerialQueue } from '../../lib/serial'
import { EMPTY_TREE, Git } from './git'
import { combineChanges } from './git-parse'

const LARGE_UNTRACKED_BYTES = 20 * 1024 * 1024
const MAX_EXCLUDES = 200
const MAX_TURN_FILES = 200
const MAX_FILE_PATCH = 6000
const LOCKFILE =
  /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Cargo\.lock|go\.sum|composer\.lock|Gemfile\.lock)$/

export interface TurnChanges {
  files: ChangeEntry[]
  truncated: boolean
  startTree: string
  endTree: string
}
const TURN_START_TTL_MS = 24 * 60 * 60 * 1000

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
  /** Tree at the start of each turn, keyed by "<projectId>:<promptId>". In memory only. */
  private readonly turnStarts = new Map<string, { tree: string; at: number }>()

  constructor(
    /** Resolves once the login-shell environment (and with it git's location) is known. */
    private readonly git: () => Promise<Git | null>,
    private readonly projectsDir: string,
    /**
     * When this app run began. A baseline older than this belongs to an earlier run (e.g. before
     * Trellis was restarted or updated) and must not be shown as "since Claude started".
     */
    private readonly runStartedAt = Date.now(),
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
            stored.takenAt >= this.runStartedAt &&
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

        const entries = await this.diffTrees(info, base, current)
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

  /**
   * Snapshot at the start of a turn. Called from the prompt hook before it is answered, so Claude
   * has not touched anything yet.
   */
  async beginTurn(projectId: string, root: string, promptId: string): Promise<void> {
    const info = await this.repoInfo(root)
    if (!info) return
    const tree = await this.snapshotTree(info)
    const now = Date.now()
    for (const [key, start] of this.turnStarts) {
      if (now - start.at > TURN_START_TTL_MS) this.turnStarts.delete(key)
    }
    this.turnStarts.set(`${projectId}:${promptId}`, { tree, at: now })
  }

  /**
   * What changed during the turn so far, including edits made through Bash. `finish` forgets the
   * turn's start; without it (a guard sending the turn back) the next check counts from the same
   * start. Null if the start is unknown.
   */
  turnChanges(
    projectId: string,
    root: string,
    promptId: string,
    finish: boolean,
  ): Promise<TurnChanges | null> {
    return this.queue.run(projectId, async () => {
      const key = `${projectId}:${promptId}`
      const start = this.turnStarts.get(key)
      if (!start) return null
      if (finish) this.turnStarts.delete(key)
      const info = await this.repoInfo(root)
      if (!info) return null
      const endTree = await this.snapshotTree(info)
      const entries = await this.diffTrees(info, start.tree, endTree)
      return {
        files: entries.slice(0, MAX_TURN_FILES),
        truncated: entries.length > MAX_TURN_FILES,
        startTree: start.tree,
        endTree,
      }
    })
  }

  /** Same as turnChanges(…, finish = true); kept for callers that only need the result. */
  endTurn(projectId: string, root: string, promptId: string): Promise<TurnChanges | null> {
    return this.turnChanges(projectId, root, promptId, true)
  }

  /**
   * Unified diff between two trees for analysis, risk-area files first, lockfiles and binaries
   * left out, each file and the whole capped so a huge turn still fits a prompt.
   */
  async turnPatch(
    root: string,
    startTree: string,
    endTree: string,
    files: readonly ChangeEntry[],
    firstPaths: ReadonlySet<string>,
    maxChars = 40_000,
  ): Promise<string> {
    const git = await this.git()
    const info = await this.repoInfo(root)
    if (!git || !info) return ''
    const prefix = info.prefix ? `${info.prefix}/` : ''
    const ordered = [...files]
      .filter((f) => !f.binary && !LOCKFILE.test(f.path))
      .sort((a, b) => Number(firstPaths.has(b.path)) - Number(firstPaths.has(a.path)))
    let out = ''
    for (const f of ordered) {
      if (out.length >= maxChars) {
        out += `\n… (more files not shown)\n`
        break
      }
      const diff =
        (await git.tryRun(info.top, [
          'diff-tree',
          '-p',
          '--no-color',
          '-M',
          startTree,
          endTree,
          '--',
          prefix + f.path,
        ])) ?? ''
      const body =
        diff.length > MAX_FILE_PATCH ? `${diff.slice(0, MAX_FILE_PATCH)}\n… (truncated)\n` : diff
      out += body
    }
    return out.slice(0, maxChars + 200)
  }

  private async diffTrees(info: RepoInfo, base: string, current: string): Promise<ChangeEntry[]> {
    const git = (await this.git())!
    const pathspec = info.prefix ? ['--', info.prefix] : []
    const args = (format: string): string[] => [
      'diff-tree',
      '-r',
      '-z',
      format,
      '-M',
      base,
      current,
      ...pathspec,
    ]
    const [nameStatus, numstat] = await Promise.all([
      git.run(info.top, args('--name-status')),
      git.run(info.top, args('--numstat')),
    ])
    return combineChanges(nameStatus, numstat, info.prefix)
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
      if (existsSync(realIndex)) {
        await fs.copyFile(realIndex, tmpIndex)
        // Keep the index's own mtime (rounded down to the second). git re-checks entries written
        // in the same second as the index ("racy git"); a fresh copy time would switch that off
        // and miss same-size edits made right after a commit.
        const { atime, mtime } = await fs.stat(realIndex)
        await fs.utimes(tmpIndex, atime, Math.floor(mtime.getTime() / 1000))
      }
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
