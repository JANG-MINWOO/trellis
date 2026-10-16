import { areaOf } from '@shared/areas'
import type { Git } from '../../lib/git'

/** Feature areas of a repository with their file counts, biggest first (for intent predictions). */
export async function projectAreas(
  git: Git | null,
  root: string,
): Promise<{ area: string; files: number }[]> {
  const out = git
    ? await git.tryRun(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
    : null
  if (!out) return []
  const counts = new Map<string, number>()
  for (const file of out.split('\0')) {
    if (!file) continue
    const area = areaOf(file)
    counts.set(area, (counts.get(area) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([area, files]) => ({ area, files }))
    .sort((a, b) => b.files - a.files)
    .slice(0, 30)
}
