// Claude conversations Trellis has seen in a project (ADR-0035): what each was about and how its
// work stands, so the human can pick one to open again.
import { deriveTasks, latestIntent, openConversations, taskOfTurn, type Task } from './tasks'
import type { ConversationSummary, TrellisEvent } from './types'

export type { ConversationSummary }

const TITLE_MAX = 200

const firstLine = (text: string): string =>
  (
    text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean) ?? ''
  ).slice(0, TITLE_MAX)

function stateIn(task: Task, sessionId: string): 'open' | 'done' | 'ended' {
  if (task.done) return 'done'
  if (task.endedAt !== null) return 'ended'
  return task.scope === 'project' || openConversations(task).includes(sessionId) ? 'open' : 'ended'
}

/** Conversations with at least one prompt, most recently active first. */
export function summarizeConversations(events: readonly TrellisEvent[]): ConversationSummary[] {
  const seen = new Map<
    string,
    { startedAt: number; lastAt: number; lastPrompt: number; turns: number; first: string }
  >()
  for (const e of events) {
    if (!e.sessionId) continue
    const known = seen.get(e.sessionId)
    if (e.kind === 'prompt.submit') {
      if (!known) {
        seen.set(e.sessionId, {
          startedAt: e.ts,
          lastAt: e.ts,
          lastPrompt: e.ts,
          turns: 1,
          first: e.data.prompt,
        })
        continue
      }
      known.turns++
      if (e.ts < known.startedAt) {
        known.startedAt = e.ts
        known.first = e.data.prompt
      }
      known.lastPrompt = Math.max(known.lastPrompt, e.ts)
    }
    if (known) known.lastAt = Math.max(known.lastAt, e.ts)
  }

  const tasks = deriveTasks(events)
  return [...seen.entries()]
    .map(([sessionId, c]): ConversationSummary => {
      const task =
        tasks.findLast((t) => t.spans.some((s) => s.sessionId === sessionId)) ??
        taskOfTurn(tasks, sessionId, c.lastPrompt)
      const intent = task ? latestIntent(task) : null
      return {
        sessionId,
        startedAt: c.startedAt,
        lastAt: c.lastAt,
        turns: c.turns,
        title: firstLine(intent?.goal || intent?.text || '') || firstLine(c.first),
        task: task ? { taskId: task.taskId, state: stateIn(task, sessionId) } : null,
      }
    })
    .sort((a, b) => b.lastAt - a.lastAt)
}
