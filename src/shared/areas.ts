// Groups changed files into "areas" (feature or folder) so a change reads as a few units of
// meaning instead of a flat file list. Heuristic for M1; M3 makes areas configurable.
import type { ChangeEntry, ChangeGroup } from './types'

export const ROOT_AREA = '.'

/** Segments after which the next segment names a feature/module. */
const FEATURE_PARENTS = new Set([
  'features',
  'feature',
  'modules',
  'module',
  'domain',
  'domains',
  'packages',
  'apps',
  'services',
  'plugins',
])

/** Top-level folders that only contain code, so the area is one level deeper. */
const CODE_ROOTS = new Set(['src', 'lib', 'app', 'source', 'internal', 'pkg'])

export function areaOf(path: string): string {
  const parts = path.split('/').filter(Boolean)
  const dirs = parts.slice(0, -1)
  if (dirs.length === 0) return ROOT_AREA

  for (let i = 0; i < dirs.length - 1; i++) {
    if (FEATURE_PARENTS.has(dirs[i]!.toLowerCase())) return dirs.slice(0, i + 2).join('/')
  }
  if (CODE_ROOTS.has(dirs[0]!.toLowerCase()) && dirs.length >= 2) return dirs.slice(0, 2).join('/')
  return dirs[0]!
}

export function groupByArea(entries: readonly ChangeEntry[]): ChangeGroup[] {
  const groups = new Map<string, ChangeGroup>()
  for (const entry of entries) {
    const area = areaOf(entry.path)
    let group = groups.get(area)
    if (!group) {
      group = { area, files: [], additions: 0, deletions: 0 }
      groups.set(area, group)
    }
    group.files.push(entry)
    group.additions += entry.additions
    group.deletions += entry.deletions
  }
  for (const group of groups.values()) group.files.sort((a, b) => a.path.localeCompare(b.path))
  return [...groups.values()].sort((a, b) => {
    if (a.area === ROOT_AREA) return 1
    if (b.area === ROOT_AREA) return -1
    return a.area.localeCompare(b.area)
  })
}
