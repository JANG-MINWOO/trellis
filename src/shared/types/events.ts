import type { ChangeEntry } from './changes'
import type { HealthSnapshot, RulesCheck } from './health'
import type {
  AnalysisRun,
  BehaviorCandidate,
  BehaviorResolution,
  DecisionCandidate,
  DecisionResolution,
  IntentData,
  TaskContinue,
  TaskDone,
} from './intent'
import type { AgentId } from './settings'

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
  | 'intent.done'
  | 'intent.continue'
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
  | (EventBase & {
      kind: 'notification'
      /** needsInput: the agent waits for the human (absent in events recorded before 0.2.0 fix). */
      data: { type: string; message: string; needsInput?: boolean }
    })
  | (EventBase & { kind: 'intent.set'; data: IntentData })
  | (EventBase & { kind: 'intent.done'; data: TaskDone })
  | (EventBase & { kind: 'intent.continue'; data: TaskContinue })
  | (EventBase & { kind: 'decision.candidate'; data: DecisionCandidate })
  | (EventBase & { kind: 'decision.resolved'; data: DecisionResolution })
  | (EventBase & { kind: 'behavior.candidate'; data: BehaviorCandidate })
  | (EventBase & { kind: 'behavior.resolved'; data: BehaviorResolution })
  | (EventBase & { kind: 'analysis.run'; data: AnalysisRun })
  | (EventBase & { kind: 'rules.check'; data: RulesCheck })
  | (EventBase & { kind: 'health.snapshot'; data: HealthSnapshot })

export type EventOf<K extends EventKind> = Extract<TrellisEvent, { kind: K }>
