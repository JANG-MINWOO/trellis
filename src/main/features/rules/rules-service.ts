// Structure rules for a project (M3): what is wrong now, what a turn made worse, and the
// human-approved baseline of violations that are accepted for the time being (ADR-0026, 0027).
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { dirPrefix } from '@shared/rel-path'
import type { Language, Project, RulesReport, Violation } from '@shared/types'
import { writeJsonAtomic } from '../../lib/json-file'
import { logFailure } from '../../lib/log'
import { resolveInsideProject } from '../../platform/paths'
import type { Git } from '../../lib/git'
import type { ChangesService, RepoInfo, TurnChanges } from '../changes'
import { runCheckCommand } from './check-command'
import { BASELINE_FILE, parseRulesConfig, RULES_FILE, type RulesConfig } from './config'
import { analyze, type Analysis } from './engine'
import { createResolver } from './resolve'
import { FactsCache, listFolder, listTree, type Listing } from './source'
import { guardReason, introducedViolations } from './verdict'

export interface RuleSettings {
  config: RulesConfig
  hasConfig: boolean
  configError: string | null
  baseline: Set<string> | null
}

export interface TreeResult {
  analysis: Analysis
  settings: RuleSettings
  truncated: boolean
}

export interface TurnVerdict {
  newViolations: Violation[]
  frozenCount: number
  check: { command: string; ok: boolean; output: string } | null
  reason: string | null
}

const MAX_MEMO = 6

function readSettings(configs: Map<string, string>): RuleSettings {
  const text = configs.get(RULES_FILE) ?? null
  const { config, error } = parseRulesConfig(text)
  let baseline: Set<string> | null = null
  const raw = configs.get(BASELINE_FILE)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { fingerprints?: unknown }
      if (Array.isArray(parsed.fingerprints))
        baseline = new Set(parsed.fingerprints.filter((f): f is string => typeof f === 'string'))
    } catch {
      baseline = null
    }
  }
  return { config, hasConfig: text !== null, configError: error, baseline }
}

/** Documents that describe the project as it is now (not history like worklogs or ADRs). */
function livingDocs(project: Project): (p: string) => boolean {
  const specs = dirPrefix(project.specsDir)
  return (p) => {
    if (!/\.mdx?$/i.test(p)) return false
    if (!p.includes('/')) return true
    if (/(^|\/)(AGENTS|CLAUDE)\.md$/.test(p)) return true
    if (specs && p.startsWith(specs) && !p.slice(specs.length).includes('/')) return true
    return /^docs\/[^/]+\.mdx?$/i.test(p)
  }
}

export class RulesService {
  private readonly cache = new FactsCache()
  private readonly memo = new Map<string, Promise<TreeResult>>()

  constructor(
    private readonly git: () => Promise<Git | null>,
    private readonly changes: ChangesService,
  ) {}

  private run(project: Project, listing: Listing, settings: RuleSettings): TreeResult {
    const files = listing.files.map((f) => f.path)
    const tsconfigs = [...listing.configs.entries()]
      .filter(([p]) => p.startsWith('tsconfig'))
      .map(([p, text]) => ({ path: p, text }))
    const resolve = createResolver({ files, tsconfigs, aliases: settings.config.aliases })
    const analysis = analyze(listing.files, settings.config, resolve, livingDocs(project))
    analysis.metrics.truncated = listing.truncated
    return { analysis, settings, truncated: listing.truncated }
  }

  /** Analysis of a git tree; rules and baseline come from `rulesTree` (the turn's start). */
  analyzeTree(
    project: Project,
    info: RepoInfo,
    tree: string,
    rulesTree = tree,
  ): Promise<TreeResult> {
    const key = `${info.top}\0${info.prefix}\0${tree}\0${rulesTree}\0${project.specsDir}`
    let result = this.memo.get(key)
    if (!result) {
      result = (async () => {
        const git = (await this.git())!
        const listing = await listTree(git, info, tree, this.cache)
        const rulesListing =
          rulesTree === tree ? listing : await listTree(git, info, rulesTree, this.cache)
        return this.run(project, listing, readSettings(rulesListing.configs))
      })()
      result.catch(() => this.memo.delete(key))
      if (this.memo.size >= MAX_MEMO) this.memo.delete(this.memo.keys().next().value!)
      this.memo.set(key, result)
    }
    return result
  }

  /** The project as it is on disk right now. */
  async current(project: Project): Promise<TreeResult> {
    const snap = await this.changes.snapshotNow(project.id, project.path)
    if (snap) return this.analyzeTree(project, snap.info, snap.tree)
    const listing = await listFolder(project.path, this.cache)
    return this.run(project, listing, readSettings(listing.configs))
  }

  report(result: TreeResult): RulesReport {
    const { baseline } = result.settings
    const fresh = result.analysis.violations.filter((v) => !baseline?.has(v.fingerprint))
    return {
      hasConfig: result.settings.hasConfig,
      configError: result.settings.configError,
      hasBaseline: baseline !== null,
      newViolations: fresh,
      frozenCount: result.analysis.violations.length - fresh.length,
    }
  }

  /**
   * What the turn broke. With `runCheck`, the project's check command runs too, and `reason` is
   * the text to send the agent back with (null when there is nothing to fix).
   */
  async turnVerdict(
    project: Project,
    changes: TurnChanges,
    options: {
      runCheck: boolean
      env: Record<string, string>
      lang: Language
      checkTimeoutMs?: number
    },
  ): Promise<TurnVerdict | null> {
    const info = await this.changes.repoInfo(project.path)
    if (!info) return null
    const [start, end] = await Promise.all([
      this.analyzeTree(project, info, changes.startTree),
      this.analyzeTree(project, info, changes.endTree, changes.startTree),
    ])
    const newViolations = introducedViolations(
      start.analysis.violations,
      end.analysis.violations,
      start.settings.baseline,
    )
    const command = project.guard.checkCommand.trim()
    const check =
      options.runCheck && command
        ? {
            command,
            ...(await runCheckCommand(command, project.path, options.env, options.checkTimeoutMs)),
          }
        : null
    return {
      newViolations,
      frozenCount: end.analysis.violations.length - newViolations.length,
      check,
      reason: options.runCheck ? guardReason(newViolations, check, options.lang) : null,
    }
  }

  /** Starts analyzing a tree in the background so the end-of-turn check is quick. */
  warm(project: Project, tree: string): void {
    void this.changes
      .repoInfo(project.path)
      .then((info) => (info ? this.analyzeTree(project, info, tree) : null))
      .catch(logFailure('rules', 'warming the start-of-turn check failed'))
  }

  /** Accepts every current violation as known debt; only new ones count from now on. */
  async freezeBaseline(project: Project): Promise<number> {
    const result = await this.current(project)
    const fingerprints = [...new Set(result.analysis.violations.map((v) => v.fingerprint))].sort()
    const file = resolveInsideProject(project.path, BASELINE_FILE)
    if (!file) throw new Error('invalid project path')
    await fs.mkdir(path.dirname(file), { recursive: true })
    await writeJsonAtomic(file, { version: 1, createdAt: new Date().toISOString(), fingerprints })
    return fingerprints.length
  }
}
