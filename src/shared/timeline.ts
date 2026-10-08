// Derives turns and agent state from the event ledger. Nothing here is stored (principle: no
// derived values next to the source).
import type { EventOf, ToolUse, TrellisEvent } from './types'

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
  prompt: string
  startedAt: number
  endedAt: number | null
  status: TurnStatus
  tools: ToolEntry[]
  /** Unique files touched by tools in this turn, in first-touch order. */
  files: string[]
  lastMessage: string | null
  waitingMessage: string | null
}

export interface SessionItem {
  type: 'session'
  key: string
  ts: number
  edge: 'start' | 'end'
  sessionId: string | null
  detail: string
  model: string | null
}

export interface IntentItem {
  type: 'intent'
  key: string
  ts: number
  text: string
}

export type TimelineItem = TurnItem | SessionItem | IntentItem

const PERMISSION_NOTIFICATIONS = new Set([
  'permission_prompt',
  'elicitation_dialog',
  'agent_needs_input',
])

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
          detail: e.data.reason,
          model: null,
        })
        break
      case 'intent.set':
        items.push({ type: 'intent', key: e.id, ts: e.ts, text: e.data.text })
        break
      case 'prompt.submit': {
        // A new prompt while the previous turn is still open means the user interrupted it.
        closeOpenTurn(sessionKey(e), 'interrupted', e.ts)
        const turn: TurnItem = {
          type: 'turn',
          key: e.promptId ?? e.id,
          sessionId: e.sessionId,
          prompt: e.data.prompt,
          startedAt: e.ts,
          endedAt: null,
          status: 'running',
          tools: [],
          files: [],
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
        if (turn && turn.status === 'running' && PERMISSION_NOTIFICATIONS.has(e.data.type)) {
          turn.status = 'waiting'
          turn.waitingMessage = e.data.message
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
  return items
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

/** The most recent intent text, or null. */
export function currentIntent(events: readonly TrellisEvent[]): EventOf<'intent.set'> | null {
  let latest: EventOf<'intent.set'> | null = null
  for (const e of events) {
    if (e.kind === 'intent.set' && (!latest || e.ts >= latest.ts)) latest = e
  }
  return latest
}
