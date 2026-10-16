// Snapshots of the working tree as git tree objects (ADR-0014): a temporary index +
// `git write-tree`, so the working tree, the real index and refs are never touched.
import { randomUUID } from 'node:crypto'
import { existsSync, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Git } from '../../lib/git'

const LARGE_UNTRACKED_BYTES = 20 * 1024 * 1024
const MAX_EXCLUDES = 200

export interface RepoInfo {
  top: string
  /** Project folder relative to the repository root, forward slashes; '' at the root. */
  prefix: string
}

export async function repoInfo(git: Git, root: string): Promise<RepoInfo | null> {
  const top = (await git.tryRun(root, ['rev-parse', '--show-toplevel']))?.trim()
  if (!top) return null
  const prefix =
    (await git.tryRun(root, ['rev-parse', '--show-prefix']))?.trim().replace(/\/$/, '') ?? ''
  return { top: path.resolve(top), prefix }
}

/** Tree of the working copy right now: tracked and untracked files, honoring .gitignore. */
export async function snapshotTree(git: Git, info: RepoInfo): Promise<string> {
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
    const excludes = await largeUntracked(git, info, scope)
    await git.run(
      info.top,
      ['add', '-A', '--', scope, ...excludes.map((p) => `:(exclude,literal)${p}`)],
      { env, timeoutMs: 120_000 },
    )
    return (await git.run(info.top, ['write-tree'], { env })).trim()
  } finally {
    await fs.rm(tmpIndex, { force: true })
    await fs.rm(`${tmpIndex}.lock`, { force: true })
  }
}

/** Huge untracked files (datasets, build output that is not ignored) would bloat .git/objects. */
async function largeUntracked(git: Git, info: RepoInfo, scope: string): Promise<string[]> {
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
