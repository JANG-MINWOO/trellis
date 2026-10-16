// Structure rules and health (M3).

export interface HealthReport {
  computedAt: number
  truncated: boolean
  fileCount: number
  textFileCount: number
  totalLines: number
  lineThreshold: number
  largestFiles: { path: string; lines: number }[]
  overThreshold: { path: string; lines: number }[]
  overThresholdCount: number
  densestFolders: { path: string; files: number }[]
  /** Structure rules (M3). */
  rules: RulesReport
  /** Paths that living documents mention but that do not exist (M4). */
  drift: DriftItem[]
  trend: HealthTrend
}

/** HealthReport without what is computed around the engine. */
export type HealthMetrics = Omit<HealthReport, 'computedAt' | 'rules' | 'drift' | 'trend'>

export type RuleId = 'max-lines' | 'folder-size' | 'duplicate' | 'cycle' | 'boundary'

export interface Violation {
  rule: RuleId
  /** Main file (or folder) the violation is about. */
  path: string
  /** Other paths involved (import target, duplicate partner, cycle members). */
  related: string[]
  /** Custom text from the rule (boundaries); other rules are described by the UI. */
  message: string
  /** Stable identity across runs, used by the baseline (ratchet). */
  fingerprint: string
  /** Measured size (lines, files, shared lines) and the limit, where the rule has one. */
  size?: number
  limit?: number
}

export interface RulesCheck {
  /** Violations not in the baseline. */
  newViolations: Violation[]
  frozenCount: number
  check: { command: string; ok: boolean; output: string } | null
  /** The turn was sent back to the agent to fix these. */
  blocked: boolean
}

export interface HealthSnapshot {
  fileCount: number
  totalLines: number
  overThresholdCount: number
  overThreshold: { path: string; lines: number }[]
  violations: number
  newViolations: number
}

export interface RulesReport {
  hasConfig: boolean
  /** The rules file exists but could not be read; defaults are in use. */
  configError: string | null
  hasBaseline: boolean
  /** Violations not in the baseline (all of them when there is no baseline). */
  newViolations: Violation[]
  frozenCount: number
}

export interface DriftItem {
  /** Document that mentions a path. */
  doc: string
  line: number
  /** The path it mentions, which does not exist. */
  target: string
}

export interface HealthTrend {
  /** When the comparison snapshot was taken (null: no older snapshot yet). */
  since: number | null
  deltas: { overThreshold: number; violations: number; totalLines: number }
  newlyOverThreshold: { path: string; lines: number }[]
}
