import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { FileNode } from '@shared/types'
import { resolveInsideProject } from '../../platform/paths'
import type { Git } from '../changes'

const HIDDEN = new Set(['.git', '.DS_Store', 'Thumbs.db'])
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** Lists one folder (lazy tree). Ignored entries are kept but flagged so the UI can dim them. */
export async function listDirectory(
  root: string,
  relDir: string,
  git: Git | null,
  inRepo: boolean,
): Promise<FileNode[]> {
  const abs = resolveInsideProject(root, relDir)
  if (!abs) return []
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(abs, { withFileTypes: true })
  } catch {
    return []
  }
  const nodes: FileNode[] = []
  for (const entry of entries) {
    if (HIDDEN.has(entry.name)) continue
    let isDir = entry.isDirectory()
    if (entry.isSymbolicLink()) {
      try {
        isDir = (await fs.stat(path.join(abs, entry.name))).isDirectory()
      } catch {
        continue
      }
    }
    const rel = relDir ? `${relDir}/${entry.name}` : entry.name
    nodes.push({ name: entry.name, path: rel, isDir, ignored: false })
  }

  if (git && inRepo && nodes.length > 0) {
    const input = nodes.map((n) => (n.isDir ? `${n.path}/` : n.path)).join('\0') + '\0'
    const out = await git.tryRun(root, ['check-ignore', '-z', '--stdin'], { input })
    if (out) {
      const ignored = new Set(
        out
          .split('\0')
          .filter(Boolean)
          .map((p) => p.replace(/\/$/, '')),
      )
      for (const n of nodes) n.ignored = ignored.has(n.path)
    }
  }

  return nodes.sort((a, b) =>
    a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : collator.compare(a.name, b.name),
  )
}
