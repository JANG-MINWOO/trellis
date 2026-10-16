import { existsSync, promises as fs } from 'node:fs'
import path from 'node:path'
import { DEFAULT_DECISIONS_DIR, DEFAULT_RISK_AREAS, DEFAULT_SPECS_DIR } from '@shared/defaults'
import type { Project, ProjectPatch, ProjectView } from '@shared/types'
import { stableId } from '../../lib/ids'
import { readJson, writeJsonAtomic } from '../../lib/json-file'
import { pathKey } from '../../platform/paths'

export class ProjectRegistry {
  private constructor(
    private readonly file: string,
    private projects: Project[],
  ) {}

  static async load(file: string): Promise<ProjectRegistry> {
    const raw = await readJson<unknown>(file, [])
    const projects = Array.isArray(raw) ? raw.filter(isProject).map(withDefaults) : []
    return new ProjectRegistry(file, projects)
  }

  list(): ProjectView[] {
    return [...this.projects]
      .sort((a, b) => (b.lastOpenedAt ?? b.addedAt) - (a.lastOpenedAt ?? a.addedAt))
      .map(view)
  }

  get(id: string): Project | undefined {
    return this.projects.find((p) => p.id === id)
  }

  /** Adds a folder (or returns the existing entry for the same folder). */
  async add(folder: string): Promise<ProjectView> {
    const resolved = path.resolve(folder)
    const stat = await fs.stat(resolved)
    if (!stat.isDirectory()) throw new Error(`Not a folder: ${resolved}`)
    const id = stableId(pathKey(resolved))
    const existing = this.get(id)
    if (existing) return view(existing)
    const project: Project = {
      id,
      name: path.basename(resolved) || resolved,
      path: resolved,
      addedAt: Date.now(),
      lastOpenedAt: null,
      recordLanguage: null,
      decisionsDir: DEFAULT_DECISIONS_DIR,
      specsDir: DEFAULT_SPECS_DIR,
      analysisEnabled: true,
      riskAreas: [...DEFAULT_RISK_AREAS],
      guard: { enforceRules: false, checkCommand: '' },
    }
    this.projects.push(project)
    await this.save()
    return view(project)
  }

  async remove(id: string): Promise<void> {
    this.projects = this.projects.filter((p) => p.id !== id)
    await this.save()
  }

  async update(id: string, patch: ProjectPatch): Promise<ProjectView> {
    const project = this.get(id)
    if (!project) throw new Error(`Unknown project: ${id}`)
    if (patch.name !== undefined && patch.name.trim()) project.name = patch.name.trim()
    if (patch.recordLanguage !== undefined) project.recordLanguage = patch.recordLanguage
    if (patch.decisionsDir !== undefined) project.decisionsDir = cleanDir(patch.decisionsDir)
    if (patch.specsDir !== undefined) project.specsDir = cleanDir(patch.specsDir)
    if (patch.analysisEnabled !== undefined) project.analysisEnabled = patch.analysisEnabled
    if (patch.riskAreas !== undefined)
      project.riskAreas = patch.riskAreas.map((g) => g.trim()).filter(Boolean)
    if (patch.guard !== undefined) project.guard = { ...project.guard, ...patch.guard }
    await this.save()
    return view(project)
  }

  async markOpened(id: string): Promise<void> {
    const project = this.get(id)
    if (!project) return
    project.lastOpenedAt = Date.now()
    await this.save()
  }

  private save(): Promise<void> {
    return writeJsonAtomic(this.file, this.projects)
  }
}

const cleanDir = (dir: string): string => dir.trim().replace(/\\/g, '/').replace(/\/+$/, '')

/** Projects saved by older versions lack newer fields. */
function withDefaults(project: Project): Project {
  const p = project as Partial<Project> & Project
  return {
    ...p,
    specsDir: typeof p.specsDir === 'string' ? p.specsDir : DEFAULT_SPECS_DIR,
    analysisEnabled: typeof p.analysisEnabled === 'boolean' ? p.analysisEnabled : true,
    riskAreas: Array.isArray(p.riskAreas) ? p.riskAreas : [...DEFAULT_RISK_AREAS],
    guard: {
      enforceRules: p.guard?.enforceRules ?? false,
      checkCommand: p.guard?.checkCommand ?? '',
    },
  }
}

function view(project: Project): ProjectView {
  return { ...project, missing: !existsSync(project.path) }
}

function isProject(value: unknown): value is Project {
  const p = value as Project
  return !!p && typeof p.id === 'string' && typeof p.path === 'string' && typeof p.name === 'string'
}
