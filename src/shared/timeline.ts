// Derives turns and agent state from the event ledger. Nothing here is stored (principle: no
// derived values next to the source).
import {
  attachTasks,
  deriveTasks,
  type IntentItem,
  type TaskEndItem,
  type TurnPrediction,
} from './tasks'
import type {
  AnalysisRun,
  BehaviorCandidate,
  ChangeEntry,
  DecisionCandidate,
  EventOf,
  IntentData,
  RulesCheck,
  ToolUse,
  TrellisEvent,
} from './types'

export type { IntentItem, TaskEndItem }

export type TurnStatus = 'running' | 'waiting' | 'done' | 'interrupted'

export interface ToolEntry extends ToolUse {
  ts: number
  failed: boolean
  error: string | null
}

export interface TurnItem {
  type: 'turn'
  key: string
  sessionId: string | null
  /** The Trellis tab the turn ran in. */
  terminalId: string | null
  prompt: string
  startedAt: number
  endedAt: number | null
  status: TurnStatus
  tools: ToolEntry[]
  /** Unique files touched by edit tools in this turn, in first-touch order. */
  files: string[]
  /**
   * What git saw change during the turn (edits made through Bash included). Null until the turn
   * ends, or when the project is not a git repository.
   */
  changes: ChangeEntry[] | null
  changesTruncated: boolean
  /** The task the turn belongs to and its intent when the prompt was sent (ADR-0034). */
  taskId: string | null
  intent: IntentData | null
  /** What this turn changed against the task's prediction; null without a prediction. */
  prediction: TurnPrediction | null
  decisions: DecisionCandidate[]
  behaviors: BehaviorCandidate[]
  analysis: AnalysisRun | null
  /** Last structure check of the turn (a blocked check is followed by a final one). */
  rules: RulesCheck | null
  /** Times the guard sent the turn back to the agent to fix problems, and the last reason. */
  sentBack: number
  sentBackFor: RulesCheck | null
  lastMessage: string | null
  waitingMessage: string | null
}

export interface SessionItem {
  type: 'session'
  key: string
  ts: number
  edge: 'start' | 'end'
  sessionId: string | null
  terminalId: string | null
  detail: string
  model: string | null
}

export type TimelineItem = TurnItem | SessionItem | IntentItem | TaskEndItem

function byTime(a: TrellisEvent, b: TrellisEvent): number {
  return a.ts - b.ts
}

/** Builds the timeline, oldest first. */
export function buildTimeline(events: readonly TrellisEvent[]): TimelineItem[] {
  const items: TimelineItem[] = []
  const turnsByPrompt = new Map<string, TurnItem>()
  const openTurnBySession = new Map<string, TurnItem>()

  const sessionKey = (e: TrellisEvent): string => e.sessionId ?? `terminal:${e.terminalId ?? '?'}`

  const closeOpenTurn = (key: string, status: TurnStatus, ts: number): void => {
    const open = openTurnBySession.get(key)
    if (open && (open.status === 'running' || open.status === 'waiting')) {
      open.status = status
      open.endedAt = ts
    }
    openTurnBySession.delete(key)
  }

  const findTurn = (e: TrellisEvent): TurnItem | undefined =>
    (e.promptId ? turnsByPrompt.get(e.promptId) : undefined) ?? openTurnBySession.get(sessionKey(e))

  for (const e of [...events].sort(byTime)) {
    switch (e.kind) {
      case 'session.start':
        items.push({
          type: 'session',
          key: e.id,
          ts: e.ts,
          edge: 'start',
          sessionId: e.sessionId,
          terminalId: e.terminalId,
          detail: e.data.source,
          model: e.data.model,
        })
        break
      case 'session.end':
        closeOpenTurn(sessionKey(e), 'interrupted', e.ts)
        items.push({
          type: 'session',
          key: e.id,
          ts: e.ts,
          edge: 'end',
          sessionId: e.sessionId,
          terminalId: e.terminalId,
          detail: e.data.reason,
          model: null,
        })
        break
      case 'decision.candidate':
      case 'behavior.candidate':
      case 'analysis.run':
      case 'rules.check': {
        const turn = e.promptId ? turnsByPrompt.get(e.promptId) : undefined
        if (!turn) break
        if (e.kind === 'decision.candidate') turn.decisions.push(e.data)
        else if (e.kind === 'behavior.candidate') turn.behaviors.push(e.data)
        else if (e.kind === 'analysis.run') turn.analysis = e.data
        else {
          turn.rules = e.data
          if (e.data.blocked) {
            // The agent keeps working on the same turn until it stops again.
            turn.sentBack++
            turn.sentBackFor = e.data
            turn.status = 'running'
            turn.endedAt = null
            openTurnBySession.set(sessionKey(e), turn)
          }
        }
        break
      }
      case 'prompt.submit': {
        // A new prompt while the previous turn is still open means the user interrupted it.
        closeOpenTurn(sessionKey(e), 'interrupted', e.ts)
        const turn: TurnItem = {
          type: 'turn',
          key: e.promptId ?? e.id,
          sessionId: e.sessionId,
          terminalId: e.terminalId,
          prompt: e.data.prompt,
          startedAt: e.ts,
          endedAt: null,
          status: 'running',
          tools: [],
          files: [],
          changes: null,
          changesTruncated: false,
          taskId: null,
          intent: null,
          prediction: null,
          decisions: [],
          behaviors: [],
          analysis: null,
          rules: null,
          sentBack: 0,
          sentBackFor: null,
          lastMessage: null,
          waitingMessage: null,
        }
        items.push(turn)
        if (e.promptId) turnsByPrompt.set(e.promptId, turn)
        openTurnBySession.set(sessionKey(e), turn)
        break
      }
      case 'tool.use':
      case 'tool.fail': {
        const turn = findTurn(e)
        if (!turn) break
        addTool(turn, e)
        if (turn.status === 'waiting') {
          turn.status = 'running'
          turn.waitingMessage = null
        }
        break
      }
      case 'notification': {
        const turn = findTurn(e)
        if (turn && turn.status === 'running' && e.data.needsInput === true) {
          turn.status = 'waiting'
          turn.waitingMessage = e.data.message
        }
        break
      }
      case 'turn.changes': {
        const turn = e.promptId ? turnsByPrompt.get(e.promptId) : undefined
        if (turn) {
          turn.changes = e.data.files
          turn.changesTruncated = e.data.truncated
        }
        break
      }
      case 'turn.stop': {
        const turn = findTurn(e)
        if (!turn) break
        turn.status = 'done'
        turn.endedAt = e.ts
        turn.lastMessage = e.data.lastMessage || null
        turn.waitingMessage = null
        if (openTurnBySession.get(sessionKey(e)) === turn) openTurnBySession.delete(sessionKey(e))
        break
      }
    }
  }
  const turns = items.filter((i): i is TurnItem => i.type === 'turn')
  return inTimeOrder([...items, ...attachTasks(turns, deriveTasks(events))])
}

/** At the same moment: a task ends, the next one starts, then sessions and turns follow. */
const RANK: Record<TimelineItem['type'], number> = { 'task-end': 0, intent: 1, session: 2, turn: 3 }
const timeOf = (item: TimelineItem): number => (item.type === 'turn' ? item.startedAt : item.ts)

function inTimeOrder(items: TimelineItem[]): TimelineItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        timeOf(a.item) - timeOf(b.item) ||
        RANK[a.item.type] - RANK[b.item.type] ||
        a.index - b.index,
    )
    .map(({ item }) => item)
}

function addTool(turn: TurnItem, e: EventOf<'tool.use'> | EventOf<'tool.fail'>): void {
  const failed = e.kind === 'tool.fail'
  turn.tools.push({
    ...e.data,
    ts: e.ts,
    failed,
    error: e.kind === 'tool.fail' ? e.data.error : null,
  })
  for (const f of e.data.files) {
    if (!turn.files.includes(f)) turn.files.push(f)
  }
}

export type AgentState = 'idle' | 'working' | 'waiting'

/** Files changed in a turn: git's view when known, otherwise what edit tools reported. */
export function turnFiles(
  turn: TurnItem,
): { path: string; status: ChangeEntry['status'] | null }[] {
  if (turn.changes) return turn.changes.map((c) => ({ path: c.path, status: c.status }))
  return turn.files.map((path) => ({ path, status: null }))
}

/** The state of the most recent turn of a session (or of any session when sessionId is null). */
export function deriveAgentState(
  items: readonly TimelineItem[],
  sessionId: string | null,
): AgentState {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]
    if (!item || item.type !== 'turn') continue
    if (sessionId && item.sessionId !== sessionId) continue
    if (item.status === 'running') return 'working'
    if (item.status === 'waiting') return 'waiting'
    return 'idle'
  }
  return 'idle'
}
