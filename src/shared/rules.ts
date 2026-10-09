// How a structure-rule violation is put into words (guard text in main, panels in the renderer).
import type { Violation } from './types'

const KEYS = {
  'max-lines': 'rules.maxLines',
  'folder-size': 'rules.folderSize',
  duplicate: 'rules.duplicate',
  cycle: 'rules.cycle',
  boundary: 'rules.boundary',
} as const

const baseName = (p: string): string => p.slice(p.lastIndexOf('/') + 1)

/** i18n key and variables for one violation; `short` omits the path (shown next to it). */
export function violationText(
  v: Violation,
  short = false,
): { key: string; vars: Record<string, string | number> } {
  const vars = {
    path: v.path,
    target: short && v.related[0] ? baseName(v.related[0]) : (v.related[0] ?? ''),
    files: [v.path, ...v.related].join(' → '),
    size: v.size ?? 0,
    limit: v.limit ?? 0,
    count: v.related.length + 1,
    message: v.message,
  }
  if (short) return { key: `rules.short.${KEYS[v.rule].slice('rules.'.length)}`, vars }
  return { key: v.rule === 'boundary' && v.message ? 'rules.boundaryMessage' : KEYS[v.rule], vars }
}
