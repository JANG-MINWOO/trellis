// Computes what changed, from git — never from hook events, so edits made through Bash count too.
// Snapshots only add unreferenced objects to .git/objects, which git gc cleans (ADR-0014).
import path from 'node:path'
import { groupByArea } from '@shared/areas'
import type { Baseline, ChangeEntry, ChangeReport } from '@shared/types'
import { readJson, writeJsonAtomic } from '../../lib/json-file'
import { KeyedSerialQueue } from '../../lib/serial'
import { EMPTY_TREE, Git } from '../../lib/git'
import { combineChanges } from './git-parse'
import { repoInfo, snapshotTree, type RepoInfo } from './snapshot'
import { turnPatch } from './turn-patch'

const MAX_TURN_FILES = 200

export interface TurnChanges {
  files: ChangeEntry[]
  truncated: boolean
  startTree: string
  endTree: string
}
const TURN_START_TTL_MS = 24 * 60 * 60 * 1000

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
    return git ? repoInfo(git, root) : null
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

  /** The tree a turn started from, if known (to prepare checks while the agent works). */
  turnStartTree(projectId: string, promptId: string): string | null {
    return this.turnStarts.get(`${projectId}:${promptId}`)?.tree ?? null
  }

  /** The turn's diff as text for analysis (see turn-patch.ts). */
  async turnPatch(
    root: string,
    startTree: string,
    endTree: string,
    files: readonly ChangeEntry[],
    firstPaths: ReadonlySet<string>,
  ): Promise<string> {
    const git = await this.git()
    const info = await this.repoInfo(root)
    return git && info ? turnPatch(git, info, startTree, endTree, files, firstPaths) : ''
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

  /** Tree of the working copy right now (tracked and untracked, not ignored), for rule checks. */
  snapshotNow(projectId: string, root: string): Promise<{ info: RepoInfo; tree: string } | null> {
    return this.queue.run(projectId, async () => {
      const info = await this.repoInfo(root)
      return info ? { info, tree: await this.snapshotTree(info) } : null
    })
  }

  private async snapshotTree(info: RepoInfo): Promise<string> {
    return snapshotTree((await this.git())!, info)
  }
}
