// When to ask "is this still the same work?" about the task in progress (ADR-0034, ADR-0035).
// The answer is the human's; these signals only decide when the intent card asks. A new
// conversation is not a signal: tasks belong to conversations, so it starts without one.
import type { TaskTurn } from './task-progress'
import type { Task } from './tasks'

/** After this long without activity, Trellis asks whether the work is still the same task. */
export const TASK_IDLE_MS = 6 * 60 * 60 * 1000

export type TaskCheckReason = 'idle' | 'off-intent' | 'off-prediction'

export interface TaskCheck {
  reason: TaskCheckReason
  /** From here on the work may be something else: where the task ends if the human says so. */
  boundary: number
}

/**
 * Whether to ask "still the same work?" about the task in progress, and from when. Signals before
 * the human last wrote or confirmed the intent do not count.
 */
export function checkTask(task: Task, turns: readonly TaskTurn[], now: number): TaskCheck | null {
  if (task.endedAt !== null) return null
  const confirmed = Math.max(task.revisions.at(-1)!.ts, task.continuedAt ?? 0)
  const mine = turns.filter((t) => t.taskId === task.taskId)
  const found: TaskCheck[] = []

  let last = confirmed
  let idle: TaskCheck | null = null
  for (const turn of mine) {
    if (!idle && turn.startedAt > confirmed && turn.startedAt - last > TASK_IDLE_MS)
      idle = { reason: 'idle', boundary: turn.startedAt }
    last = Math.max(last, turn.endedAt ?? turn.startedAt)
  }
  if (!idle && now - last > TASK_IDLE_MS) idle = { reason: 'idle', boundary: last + 1 }
  if (idle) found.push(idle)

  for (const turn of mine) {
    if (turn.startedAt <= confirmed) continue
    const fit = turn.analysis?.intentFit
    if (fit === 'no') {
      found.push({ reason: 'off-intent', boundary: turn.startedAt })
      break
    }
    // Without the analysis' judgment, a turn that left every predicted area is the only hint.
    if (fit !== 'yes' && turn.prediction?.missedAll && turn.prediction.unexpected.length > 0) {
      found.push({ reason: 'off-prediction', boundary: turn.startedAt })
      break
    }
  }
  return found.sort((a, b) => a.boundary - b.boundary)[0] ?? null
}
