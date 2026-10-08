import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { DecisionDoc, DecisionList } from '@shared/types'
import { resolveInsideProject } from '../../platform/paths'

const INDEX_FILES = new Set(['readme.md', 'index.md', 'template.md'])
const STATUS_LINE = /^\s*[-*]?\s*(?:상태|status)\s*[:：]\s*(.+?)\s*$/im

/** Lists decision records (one markdown file each) in the project's configured folder. */
export async function listDecisionDocs(root: string, dir: string): Promise<DecisionList> {
  if (!dir.trim()) return { kind: 'disabled' }
  const abs = resolveInsideProject(root, dir)
  if (!abs) return { kind: 'missing', dir }
  let names: string[]
  try {
    names = await fs.readdir(abs)
  } catch {
    return { kind: 'missing', dir }
  }
  const docs: DecisionDoc[] = []
  for (const name of names) {
    if (!name.toLowerCase().endsWith('.md') || INDEX_FILES.has(name.toLowerCase())) continue
    const file = path.join(abs, name)
    try {
      const [stat, text] = await Promise.all([fs.stat(file), fs.readFile(file, 'utf8')])
      if (!stat.isFile()) continue
      const head = text.slice(0, 4000)
      const title = /^#\s+(.+)$/m.exec(head)?.[1]?.trim() ?? name.replace(/\.md$/i, '')
      docs.push({
        path: `${dir.replace(/\/$/, '')}/${name}`,
        title,
        status: STATUS_LINE.exec(head)?.[1] ?? null,
        modifiedAt: stat.mtimeMs,
      })
    } catch {
      // unreadable file; skip
    }
  }
  docs.sort((a, b) => b.path.localeCompare(a.path, undefined, { numeric: true }))
  return { kind: 'ok', dir, docs }
}
