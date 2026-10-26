// Intent layer (ADR-0012): behavior (business words) / decisions (consequences) / implementation.

export interface IntentData {
  /** Full text as written (older events only have this). */
  text: string
  goal?: string
  /** "Must not break" — each line can become an invariant. */
  mustNot?: string
  /** Areas the human expects to change, checked against what actually changed (F9). */
  predictedAreas?: string[]
  /** The task this intent belongs to (ADR-0034); a refinement keeps the id. Absent before 0.3. */
  taskId?: string
  /** A new task that also takes the turns since this time (when Trellis asked about them). */
  from?: number
  /**
   * 'conversation': the task belongs to the Claude conversation it was written in (ADR-0035).
   * Absent in intents written before: those cover the whole project, one task at a time.
   */
  scope?: 'conversation'
}

/** The human ended a task. `at` may be earlier than the event when Trellis asked about later turns. */
export interface TaskDone {
  taskId: string
  at: number
}

/**
 * The work in the event's conversation belongs to this task from `from` (default: the event's
 * time): "still this task" when Trellis asked, the task taken into another conversation, or main
 * tying a task to the conversation it was waiting for (ADR-0035).
 */
export interface TaskContinue {
  taskId: string
  from?: number
}

/** Does the turn's request continue the task's intent? The analysis' guess (ADR-0034). */
export type IntentFit = 'yes' | 'no' | 'unclear'

/** A "must not" line the diff seems to break, as the analysis read it. */
export interface MustNotConcern {
  rule: string
  why: string
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
  /** Only when the turn had an intent; absent in runs recorded before ADR-0034. */
  intentFit?: IntentFit | null
  mustNotBroken?: MustNotConcern[]
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
