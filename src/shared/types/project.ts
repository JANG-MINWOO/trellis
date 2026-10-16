import type { Language } from './settings'

export interface Project {
  id: string
  name: string
  path: string
  addedAt: number
  lastOpenedAt: number | null
  /** Language for records Trellis writes into this project. null follows the app language. */
  recordLanguage: Language | null
  /** Project-relative folder of decision records. Empty string disables the decisions panel. */
  decisionsDir: string
  /** Project-relative folder of behavior specs (one markdown file per area). */
  specsDir: string
  /** Analyze finished turns with the agent's headless mode (uses the user's subscription). */
  analysisEnabled: boolean
  /** Globs whose changes always ask the human, with or without analysis (auth, payments…). */
  riskAreas: string[]
  guard: {
    /** Before a turn ends, send new rule violations / a failing check back to the agent. */
    enforceRules: boolean
    /** Project's own check (e.g. "npm run check"), run at the end of each turn. '' = none. */
    checkCommand: string
  }
}

/** A project as returned to the UI, with facts computed at read time (never stored). */
export interface ProjectView extends Project {
  missing: boolean
}

export type ProjectPatch = Partial<
  Pick<
    Project,
    'name' | 'recordLanguage' | 'decisionsDir' | 'specsDir' | 'analysisEnabled' | 'riskAreas'
  >
> & { guard?: Partial<Project['guard']> }
