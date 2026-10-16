import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Language, Project, TemplatePlan } from '@shared/types'
import { resolveInsideProject } from '../../platform/paths'
import { RULES_FILE } from '../rules'
import {
  agentsMd,
  claudeMd,
  decisionsReadme,
  detectStack,
  rulesJson,
  specsReadme,
} from './contents'

async function exists(root: string, rel: string): Promise<boolean> {
  const abs = resolveInsideProject(root, rel)
  if (!abs) return true
  try {
    await fs.lstat(abs)
    return true
  } catch {
    return false
  }
}

const dir = (d: string): string => d.trim().replace(/\/+$/, '')

export async function planTemplates(project: Project, lang: Language): Promise<TemplatePlan> {
  const rootFiles = new Set(await fs.readdir(project.path).catch(() => [] as string[]))
  const stack = detectStack(rootFiles)
  const dirs = { decisions: dir(project.decisionsDir), specs: dir(project.specsDir) }
  const hasInstructions = rootFiles.has('AGENTS.md') || rootFiles.has('CLAUDE.md')
  const candidates: { path: string; content: string; exists?: boolean }[] = [
    { path: RULES_FILE, content: rulesJson(stack) },
    // One instruction source: if either file exists, both are left alone.
    {
      path: 'AGENTS.md',
      content: agentsMd(lang, project.name, dirs, project.guard.checkCommand),
      exists: hasInstructions,
    },
    { path: 'CLAUDE.md', content: claudeMd, exists: hasInstructions },
  ]
  if (dirs.decisions)
    candidates.push({ path: `${dirs.decisions}/README.md`, content: decisionsReadme(lang) })
  if (dirs.specs) candidates.push({ path: `${dirs.specs}/README.md`, content: specsReadme(lang) })
  const files = await Promise.all(
    candidates.map(async (c) => ({
      path: c.path,
      content: c.content,
      exists: c.exists ?? (await exists(project.path, c.path)),
    })),
  )
  return { stack, files }
}

/** Writes the chosen files that do not exist yet. Never overwrites. */
export async function applyTemplates(
  project: Project,
  lang: Language,
  paths: readonly string[],
): Promise<string[]> {
  const plan = await planTemplates(project, lang)
  const written: string[] = []
  for (const file of plan.files) {
    if (file.exists || !paths.includes(file.path)) continue
    const abs = resolveInsideProject(project.path, file.path)
    if (!abs) continue
    await fs.mkdir(path.dirname(abs), { recursive: true })
    try {
      await fs.writeFile(abs, file.content, { encoding: 'utf8', flag: 'wx' })
      written.push(file.path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
  }
  return written
}
