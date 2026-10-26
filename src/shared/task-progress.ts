// How a task's turns went (ADR-0034): each turn gets its task and the intent at that time, the
// prediction is checked across the task, and the timeline gets markers where tasks start and end.
import { areaOf } from './areas'
import { intentAt, latestIntent, taskOfTurn, type Task } from './tasks'
import type { IntentData, IntentFit, MustNotConcern } from './types'

export interface TurnPrediction {
  /** Areas this turn changed for the first time in the task without the intent predicting them. */
  unexpected: string[]
  /** Every area the turn changed was predicted. */
  withinPrediction: boolean
  /** The turn changed files, but in none of the predicted areas. */
  missedAll: boolean
}

/** The parts of a timeline turn tasks use (structural, so this file does not import timeline). */
export interface TaskTurn {
  key: string
  sessionId: string | null
  startedAt: number
  endedAt: number | null
  changes: readonly { path: string }[] | null
  analysis: { intentFit?: IntentFit | null; mustNotBroken?: MustNotConcern[] } | null
  taskId: string | null
  intent: IntentData | null
  prediction: TurnPrediction | null
}

export interface IntentItem {
  type: 'intent'
  key: string
  ts: number
  taskId: string
  /** 0 started the task; later revisions refine it. */
  revision: number
  intent: IntentData
}

export interface TaskEndItem {
  type: 'task-end'
  key: string
  ts: number
  taskId: string
  turns: number
  unexpected: string[]
}

const areasOf = (turn: TaskTurn): string[] =>
  turn.changes ? [...new Set(turn.changes.map((c) => areaOf(c.path)))] : []

/**
 * Gives each turn (oldest first) its task, the intent at that time and its prediction check, and
 * returns the timeline markers: where tasks start or are refined, and where they were ended.
 */
export function attachTasks(
  turns: readonly TaskTurn[],
  tasks: readonly Task[],
): (IntentItem | TaskEndItem)[] {
  const seen = new Map<string, Set<string>>()
  for (const turn of turns) {
    const task = taskOfTurn(tasks, turn.sessionId, turn.startedAt)
    const intent = task ? intentAt(task, turn.startedAt) : null
    turn.taskId = task?.taskId ?? null
    turn.intent = intent
    turn.prediction = null
    if (!task || !intent) continue
    const known = seen.get(task.taskId) ?? new Set<string>()
    seen.set(task.taskId, known)
    const areas = areasOf(turn)
    const fresh = areas.filter((a) => !known.has(a))
    for (const a of areas) known.add(a)
    const predicted = intent.predictedAreas ?? []
    if (predicted.length === 0 || areas.length === 0) continue
    turn.prediction = {
      unexpected: fresh.filter((a) => !predicted.includes(a)),
      withinPrediction: areas.every((a) => predicted.includes(a)),
      missedAll: !areas.some((a) => predicted.includes(a)),
    }
  }

  const items: (IntentItem | TaskEndItem)[] = []
  for (const task of tasks) {
    task.revisions.forEach((r, revision) =>
      items.push({
        type: 'intent',
        key: r.id,
        ts: revision === 0 ? task.startedAt : r.ts,
        taskId: task.taskId,
        revision,
        intent: r.data,
      }),
    )
    if (task.done && task.endedAt !== null) {
      const progress = taskProgress(task, turns)
      items.push({
        type: 'task-end',
        key: `end:${task.taskId}`,
        ts: task.endedAt,
        taskId: task.taskId,
        turns: progress.turns,
        unexpected: progress.unexpected,
      })
    }
  }
  return items
}

/** The conversation's latest task: one it was on, or the task of its latest turn. */
export function lastTaskOf(
  tasks: readonly Task[],
  turns: readonly TaskTurn[],
  sessionId: string | null,
): Task | null {
  if (!sessionId) return null
  const ids = new Set(turns.filter((t) => t.sessionId === sessionId).map((t) => t.taskId))
  return (
    tasks.findLast((t) => ids.has(t.taskId) || t.spans.some((s) => s.sessionId === sessionId)) ??
    null
  )
}

/** When the conversation's turns have no task yet: from its first turn (to take them in). */
export function untaskedSince(turns: readonly TaskTurn[], sessionId: string | null): number | null {
  if (!sessionId) return null
  const mine = turns.filter((t) => t.sessionId === sessionId)
  return mine.length > 0 && mine.every((t) => t.taskId === null) ? mine[0]!.startedAt : null
}

export interface TaskProgress {
  turns: number
  /** Turn keys (prompt ids), to find the task's decision and behavior cards. */
  turnKeys: string[]
  /** Areas changed so far, in the order they first changed. */
  changed: string[]
  /** Predicted when they first changed. */
  hit: string[]
  /** Not predicted when they first changed (empty while the task predicts nothing). */
  unexpected: string[]
  /** In the latest prediction and not changed (yet). */
  untouched: string[]
  predicted: boolean
  /** Latest concern per "must not" line, as the analysis read the turns. */
  mustNotBroken: MustNotConcern[]
}

/** The task across its turns; turns must already carry their task (see attachTasks). */
export function taskProgress(task: Task, turns: readonly TaskTurn[]): TaskProgress {
  const mine = turns.filter((t) => t.taskId === task.taskId)
  const changed: string[] = []
  const hit: string[] = []
  const unexpected: string[] = []
  const concerns = new Map<string, MustNotConcern>()
  for (const turn of mine) {
    const predicted = turn.intent?.predictedAreas ?? []
    for (const area of areasOf(turn)) {
      if (changed.includes(area)) continue
      changed.push(area)
      if (predicted.includes(area)) hit.push(area)
      else if (predicted.length > 0) unexpected.push(area)
    }
    for (const c of turn.analysis?.mustNotBroken ?? []) concerns.set(c.rule, c)
  }
  const latest = latestIntent(task).predictedAreas ?? []
  return {
    turns: mine.length,
    turnKeys: mine.map((t) => t.key),
    changed,
    hit,
    unexpected,
    untouched: latest.filter((a) => !changed.includes(a)),
    predicted: task.revisions.some((r) => (r.data.predictedAreas?.length ?? 0) > 0),
    mustNotBroken: [...concerns.values()],
  }
}
