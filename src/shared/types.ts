// Core domain types shared by main and renderer. Agent- and stack-agnostic (ADR-0009).

export type Language = 'ko' | 'en'
export type ThemePreference = 'system' | 'dark' | 'light'
export type LaunchMode = 'continue' | 'new'
/**
 * How Claude handles permission prompts when Trellis starts it. 'claude-default' passes nothing
 * and lets the user's Claude Code settings decide; 'bypass' is --dangerously-skip-permissions.
 */
export type PermissionMode =
  'claude-default' | 'manual' | 'acceptEdits' | 'auto' | 'plan' | 'bypass'
/**
 * 'ask' asks once which editor to use; 'app' uses a detected editor (Settings.editor.app);
 * 'reveal' shows the file in Finder/Explorer instead of opening it.
 */
export type EditorKind = 'ask' | 'app' | 'system' | 'reveal' | 'custom'
export type AgentId = 'claude-code'

export interface EditorApp {
  id: string
  name: string
}

export interface Settings {
  /** null until the user picks a language on first run. */
  language: Language | null
  theme: ThemePreference
  claude: {
    /** Empty string means "find it on PATH". */
    path: string
    /** Extra CLI arguments, parsed like a shell command line. */
    extraArgs: string
    defaultMode: LaunchMode
    /** Permission mode preselected when a session starts (changeable per launch). */
    permissionMode: PermissionMode
    /**
     * What happens when a project opens: 'ask' shows the launch card (choose permissions and
     * continue/new), 'start' launches right away with the defaults above.
     */
    onProjectOpen: 'ask' | 'start'
  }
  editor: { kind: EditorKind; app: string; customPath: string }
  terminal: {
    fontSize: number
    fontFamily: string
    /** WebGL rendering. Off by default: the DOM renderer is slower but never fails to repaint. */
    gpu: boolean
    /**
     * Native input box under Claude tabs. Text is composed by the OS (Korean IME works) and sent
     * as one paste, which avoids Claude Code's jamo-splitting bug after switching languages.
     */
    composer: boolean
  }
  notifications: { enabled: boolean }
  /** Headless analysis of finished turns (decisions, behavior changes). */
  analysis: { model: string }
  lastProjectId: string | null
}

export type SettingsPatch = {
  [K in keyof Settings]?: Settings[K] extends object
    ? Settings[K] extends unknown[]
      ? Settings[K]
      : Partial<Settings[K]>
    : Settings[K]
}

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

// ---------------------------------------------------------------------------------------------
// Events: the append-only ledger. Turns, agent state and the current intent are computed from it.

export type EventKind =
  | 'session.start'
  | 'session.end'
  | 'prompt.submit'
  | 'tool.use'
  | 'tool.fail'
  | 'turn.stop'
  | 'turn.changes'
  | 'notification'
  | 'intent.set'
  | 'decision.candidate'
  | 'decision.resolved'
  | 'behavior.candidate'
  | 'behavior.resolved'
  | 'analysis.run'
  | 'rules.check'
  | 'health.snapshot'

export interface ToolUse {
  tool: string
  /** Project-relative paths (forward slashes) the tool touched, when known. */
  files: string[]
  command: string | null
  detail: string | null
  durationMs: number | null
}

interface EventBase {
  id: string
  ts: number
  projectId: string
  agent: AgentId | 'trellis'
  sessionId: string | null
  promptId: string | null
  terminalId: string | null
}

export type TrellisEvent =
  | (EventBase & { kind: 'session.start'; data: { source: string; model: string | null } })
  | (EventBase & { kind: 'session.end'; data: { reason: string } })
  | (EventBase & { kind: 'prompt.submit'; data: { prompt: string } })
  | (EventBase & { kind: 'tool.use'; data: ToolUse })
  | (EventBase & { kind: 'tool.fail'; data: ToolUse & { error: string } })
  | (EventBase & { kind: 'turn.stop'; data: { lastMessage: string } })
  /** What git saw change between the prompt and the end of the turn (includes Bash edits). */
  | (EventBase & { kind: 'turn.changes'; data: { files: ChangeEntry[]; truncated: boolean } })
  | (EventBase & { kind: 'notification'; data: { type: string; message: string } })
  | (EventBase & { kind: 'intent.set'; data: IntentData })
  | (EventBase & { kind: 'decision.candidate'; data: DecisionCandidate })
  | (EventBase & { kind: 'decision.resolved'; data: DecisionResolution })
  | (EventBase & { kind: 'behavior.candidate'; data: BehaviorCandidate })
  | (EventBase & { kind: 'behavior.resolved'; data: BehaviorResolution })
  | (EventBase & { kind: 'analysis.run'; data: AnalysisRun })
  | (EventBase & { kind: 'rules.check'; data: RulesCheck })
  | (EventBase & { kind: 'health.snapshot'; data: HealthSnapshot })

export type EventOf<K extends EventKind> = Extract<TrellisEvent, { kind: K }>

// ---------------------------------------------------------------------------------------------
// Terminals

export type TerminalKind = 'claude' | 'shell'

export interface TerminalInfo {
  id: string
  projectId: string
  kind: TerminalKind
  title: string
  /** 1-based position among terminals of the same kind in the project ("Claude 2"). */
  index: number
  /** Permission mode the current process was started with (claude terminals only). */
  permissionMode: PermissionMode | null
  /** Claude session id when known (set for new sessions, learned from events otherwise). */
  sessionId: string | null
  startedAt: number
  running: boolean
  exitCode: number | null
}

export interface TerminalStartRequest {
  projectId: string
  kind: TerminalKind
  mode?: LaunchMode
  permissionMode?: PermissionMode
  /** Restart this terminal (same tab). */
  terminalId?: string
  /** Open an additional tab instead of reusing the project's first terminal of this kind. */
  newTab?: boolean
  cols: number
  rows: number
}

export type TerminalStartResult =
  | { ok: true; terminal: TerminalInfo }
  | {
      ok: false
      reason: 'agent-not-found' | 'project-missing' | 'spawn-failed' | 'session-in-use'
      message: string
    }

// ---------------------------------------------------------------------------------------------
// Changes (computed from git, never from hook events)

export type ChangeStatus = 'A' | 'M' | 'D' | 'R' | 'T'
export type Baseline = 'session' | 'head'

export interface ChangeEntry {
  path: string
  oldPath: string | null
  status: ChangeStatus
  additions: number
  deletions: number
  binary: boolean
}

export interface ChangeGroup {
  area: string
  files: ChangeEntry[]
  additions: number
  deletions: number
}

export type ChangeReport =
  | { kind: 'not-repo' }
  | { kind: 'error'; message: string }
  | {
      kind: 'ok'
      baseline: Baseline
      /** When the session baseline is missing we fall back to HEAD and say so. */
      baselineFallback: boolean
      baselineTakenAt: number | null
      branch: string | null
      groups: ChangeGroup[]
      totals: { files: number; additions: number; deletions: number }
      computedAt: number
    }

// ---------------------------------------------------------------------------------------------
// Files, decisions, health, environment

export interface FileNode {
  name: string
  path: string
  isDir: boolean
  ignored: boolean
}

export interface DecisionDoc {
  path: string
  title: string
  status: string | null
  modifiedAt: number
}

export type DecisionList =
  | { kind: 'disabled' }
  | { kind: 'missing'; dir: string }
  | { kind: 'ok'; dir: string; docs: DecisionDoc[] }

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
}

export interface ToolStatus {
  found: boolean
  path: string | null
  version: string | null
}

export interface EnvironmentStatus {
  platform: 'darwin' | 'win32' | 'linux'
  claude: ToolStatus
  git: ToolStatus
  shellEnvResolved: boolean
}

export interface AppInfo {
  version: string
  /** Version plus git commit of the build, e.g. "0.1.0+b5f7716" (dirty builds end in "-dirty"). */
  build: string
  platform: 'darwin' | 'win32' | 'linux'
  isDev: boolean
  locale: string
}

// ---------------------------------------------------------------------------------------------
// Intent layer (ADR-0012): behavior (business words) / decisions (consequences) / implementation.

export interface IntentData {
  /** Full text as written (older events only have this). */
  text: string
  goal?: string
  /** "Must not break" — each line can become an invariant. */
  mustNot?: string
  /** Areas the human expects to change, checked against what actually changed (F9). */
  predictedAreas?: string[]
}

export type DecisionKind =
  'dependency' | 'architecture' | 'data' | 'security' | 'api' | 'behavior' | 'infra' | 'other'
export type Risk = 'high' | 'medium' | 'low'

export interface DecisionCandidate {
  candidateId: string
  /** 'analysis' = found by the agent; 'risk-area' = a configured risk area changed. */
  source: 'analysis' | 'risk-area'
  title: string
  what: string
  /** The agent's guess at the reason — shown as a guess, never recorded as the human's reason. */
  whyGuess: string
  alternatives: string
  /** Consequences and trade-offs in plain words (the layer a non-developer can judge). */
  consequences: string
  kind: DecisionKind
  risk: Risk
  files: string[]
}

export interface DecisionResolution {
  candidateId: string
  resolution: 'accepted' | 'dismissed'
  /** The human's reason in their own words ('' when dismissed without one). */
  reason: string
  /** True when the human kept the agent's guess as the reason. */
  reasonFromGuess: boolean
  /** Project-relative path of the written record, when one was written. */
  docPath: string | null
}

export type SpecKind = 'behavior' | 'invariant'

export interface BehaviorCandidate {
  candidateId: string
  source: 'analysis' | 'intent'
  op: 'add' | 'change' | 'remove'
  kind: SpecKind
  /** Feature area in plain words, e.g. "로그인". */
  area: string
  /** Existing spec item for change/remove. */
  targetId: string | null
  /** EARS-style for behaviors ("WHEN …, THE SYSTEM SHALL …"), a plain rule for invariants. */
  statement: string
  files: string[]
}

export interface BehaviorResolution {
  candidateId: string
  resolution: 'accepted' | 'dismissed'
  /** The statement as finally accepted (the human may edit it). */
  statement: string
  area: string
  specPath: string | null
  itemId: string | null
}

export interface AnalysisRun {
  status: 'ok' | 'error' | 'skipped'
  durationMs: number
  model: string
  decisions: number
  behaviors: number
  message: string | null
}

export type RuleId = 'max-lines' | 'folder-size' | 'duplicate' | 'cycle' | 'boundary'

export interface Violation {
  rule: RuleId
  /** Main file (or folder) the violation is about. */
  path: string
  /** Other paths involved (import target, duplicate partner, cycle members). */
  related: string[]
  message: string
  /** Stable identity across runs, used by the baseline (ratchet). */
  fingerprint: string
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

export interface SpecItem {
  id: string
  kind: SpecKind
  text: string
}

export interface SpecArea {
  area: string
  path: string
  items: SpecItem[]
}

export interface SpecList {
  dir: string
  areas: SpecArea[]
  /** Spec item id → test files that mention it. */
  tests: Record<string, string[]>
}

export interface RulesReport {
  hasConfig: boolean
  hasBaseline: boolean
  newViolations: Violation[]
  frozenViolations: Violation[]
  computedAt: number
}

export interface DriftItem {
  /** Document that mentions a path. */
  doc: string
  line: number
  /** The path it mentions, which does not exist. */
  target: string
}

export interface TemplatePlan {
  stack: string
  files: { path: string; exists: boolean; content: string }[]
}

export interface HealthTrend {
  /** When the comparison snapshot was taken (null: no older snapshot yet). */
  since: number | null
  deltas: { overThreshold: number; violations: number; totalLines: number }
  newlyOverThreshold: { path: string; lines: number }[]
}
