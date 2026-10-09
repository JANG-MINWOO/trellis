// Reads and writes the behavior specs of a project (ADR-0024).
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { slugify } from '@shared/decisions'
import { applyToSpec, parseSpec, SPEC_ID } from '@shared/specs'
import type { BehaviorCandidate, Language, SpecArea, SpecList } from '@shared/types'
import { resolveInsideProject } from '../../platform/paths'
import type { Git } from '../changes'

const INDEX_FILES = new Set(['readme.md', 'index.md'])
const TEST_PATH =
  /(^|\/)(tests?|__tests__|spec|specs|e2e)\/|[._-](test|spec)\.[a-z]+$|(^|\/)test_[^/]+\.py$/i
// Docs and data under test folders (and the spec files themselves) mention ids without testing them.
const NOT_CODE = /\.(md|mdx|txt|rst|adoc|json|ya?ml|lock|svg|png|jpe?g|gif)$/i
const MAX_TEST_FILES = 3000
const MAX_TEST_BYTES = 512 * 1024

async function readAreas(
  root: string,
  dir: string,
): Promise<{ areas: SpecArea[]; texts: Map<string, string> }> {
  const abs = dir.trim() ? resolveInsideProject(root, dir) : null
  const texts = new Map<string, string>()
  if (!abs) return { areas: [], texts }
  let names: string[]
  try {
    names = await fs.readdir(abs)
  } catch {
    return { areas: [], texts }
  }
  const areas: SpecArea[] = []
  for (const name of names.sort()) {
    if (!name.toLowerCase().endsWith('.md') || INDEX_FILES.has(name.toLowerCase())) continue
    try {
      const text = await fs.readFile(path.join(abs, name), 'utf8')
      const rel = `${dir.replace(/\/$/, '')}/${name}`
      texts.set(rel, text)
      const parsed = parseSpec(text)
      areas.push({
        area: parsed.title || name.replace(/\.md$/i, ''),
        path: rel,
        items: parsed.items,
      })
    } catch {
      // unreadable; skip
    }
  }
  return { areas, texts }
}

/** Test files that mention a spec id (e.g. a test named "B-003 locks the account"). */
async function testLinks(
  root: string,
  specsDir: string,
  git: Git | null,
  inRepo: boolean,
): Promise<Record<string, string[]>> {
  if (!git || !inRepo) return {}
  const out = await git.tryRun(root, [
    'ls-files',
    '-z',
    '--cached',
    '--others',
    '--exclude-standard',
  ])
  if (!out) return {}
  const specsPrefix = specsDir ? `${specsDir.replace(/\/$/, '')}/` : null
  const files = out
    .split('\0')
    .filter((f) => f && TEST_PATH.test(f) && !NOT_CODE.test(f))
    .filter((f) => !specsPrefix || !f.startsWith(specsPrefix))
    .slice(0, MAX_TEST_FILES)
  const links: Record<string, string[]> = {}
  for (const file of files) {
    try {
      const abs = path.join(root, ...file.split('/'))
      const stat = await fs.stat(abs)
      if (stat.size > MAX_TEST_BYTES) continue
      const text = await fs.readFile(abs, 'utf8')
      for (const m of text.matchAll(SPEC_ID)) {
        const id = `${m[1]}-${m[2]}`
        const list = (links[id] ??= [])
        if (!list.includes(file)) list.push(file)
      }
    } catch {
      // vanished or unreadable
    }
  }
  return links
}

export async function listSpecs(
  root: string,
  dir: string,
  git: Git | null,
  inRepo: boolean,
): Promise<SpecList> {
  const [{ areas }, tests] = await Promise.all([
    readAreas(root, dir),
    testLinks(root, dir, git, inRepo),
  ])
  return { dir, areas, tests }
}

/** Writes an accepted behavior change into its area file. Returns the file and the item id. */
export async function applyBehavior(
  root: string,
  dir: string,
  change: Pick<BehaviorCandidate, 'op' | 'kind' | 'targetId'> & { area: string; statement: string },
  lang: Language,
): Promise<{ specPath: string; itemId: string | null }> {
  if (!dir.trim()) throw new Error('specs folder is not set')
  const absDir = resolveInsideProject(root, dir)
  if (!absDir) throw new Error('specs folder is outside the project')
  const { areas, texts } = await readAreas(root, dir)
  const allIds = areas.flatMap((a) => a.items.map((i) => i.id))
  // Changes go to the file that holds the target item; additions to the file of the same area.
  const byTarget = change.targetId
    ? areas.find((a) => a.items.some((i) => i.id === change.targetId))
    : undefined
  const byArea = areas.find((a) => a.area.trim().toLowerCase() === change.area.trim().toLowerCase())
  let rel = byTarget?.path ?? byArea?.path
  if (!rel) {
    const base = slugify(change.area, 'general')
    let name = `${base}.md`
    for (let n = 2; texts.has(`${dir}/${name}`); n++) name = `${base}-${n}.md`
    rel = `${dir.replace(/\/$/, '')}/${name}`
  }
  const edit = applyToSpec(texts.get(rel) ?? null, change, allIds, lang)
  await fs.mkdir(absDir, { recursive: true })
  await fs.writeFile(path.join(root, ...rel.split('/')), edit.markdown, 'utf8')
  return { specPath: rel, itemId: edit.itemId }
}
