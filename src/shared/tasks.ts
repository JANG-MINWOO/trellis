// Tasks (ADR-0034): an intent is written for one piece of work that starts, may be refined, and
// ends. Which turns belong to which task, the prediction check across a task's turns and when to
// ask "is this still the same work?" are all computed from the ledger.
import { areaOf } from './areas'
import type { EventOf, IntentData, IntentFit, MustNotConcern, TrellisEvent } from './types'

export interface Task {
  taskId: string
  /** The intent as written and refined, oldest first. */
  revisions: EventOf<'intent.set'>[]
  startedAt: number
  /** Null while the task is in progress. */
  endedAt: number | null
  /** The human ended it (older tasks were only replaced by the next intent). */
  done: boolean
  /** Last time the human answered "still this task" when Trellis asked. */
  continuedAt: number | null
}

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

/** Intents written before ADR-0034 have no task id: each one is its own task. */
const taskIdOf = (e: EventOf<'intent.set'>): string => e.data.taskId || e.id

export function deriveTasks(events: readonly TrellisEvent[]): Task[] {
  const tasks: Task[] = []
  const byId = new Map<string, Task>()
  const intents = events.filter((e) => e.kind.startsWith('intent.')).sort((a, b) => a.ts - b.ts)
  for (const e of intents) {
    if (e.kind === 'intent.set') {
      const id = taskIdOf(e)
      const known = byId.get(id)
      if (known) {
        known.revisions.push(e)
        // Refining the last task after ending it opens it again.
        if (known === tasks.at(-1) && known.endedAt !== null) {
          known.endedAt = null
          known.done = false
        }
        continue
      }
      const last = tasks.at(-1)
      const startedAt = Math.max(Math.min(e.data.from ?? e.ts, e.ts), last ? last.startedAt + 1 : 0)
      // A new task ends the previous one where it starts, at the latest.
      if (last && (last.endedAt === null || last.endedAt > startedAt)) last.endedAt = startedAt
      const task: Task = {
        taskId: id,
        revisions: [e],
        startedAt,
        endedAt: null,
        done: false,
        continuedAt: null,
      }
      tasks.push(task)
      byId.set(id, task)
    } else if (e.kind === 'intent.done') {
      const task = byId.get(e.data.taskId)
      if (!task || task.endedAt !== null) continue
      task.endedAt = Math.max(Math.min(e.data.at, e.ts), task.startedAt)
      task.done = true
    } else if (e.kind === 'intent.continue') {
      const task = byId.get(e.data.taskId)
      if (task) task.continuedAt = e.ts
    }
  }
  return tasks
}

/** The task in progress at `ts` (tasks follow one another, so the latest one started decides). */
export function taskAt(tasks: readonly Task[], ts: number): Task | null {
  for (let i = tasks.length - 1; i >= 0; i--) {
    const task = tasks[i]!
    if (task.startedAt <= ts) return task.endedAt === null || ts < task.endedAt ? task : null
  }
  return null
}

/** The intent as it read at `ts`; turns taken in from before the first revision get the first. */
export function intentAt(task: Task, ts: number): IntentData {
  let pick = task.revisions[0]!
  for (const r of task.revisions) if (r.ts <= ts) pick = r
  return pick.data
}

export const latestIntent = (task: Task): IntentData => task.revisions.at(-1)!.data

export function activeTask(tasks: readonly Task[]): Task | null {
  const last = tasks.at(-1)
  return last && last.endedAt === null ? last : null
}

/** The intent in force when this prompt was sent, or null outside any task. */
export function intentForPrompt(
  events: readonly TrellisEvent[],
  promptId: string,
): IntentData | null {
  const prompt = events.find((e) => e.kind === 'prompt.submit' && e.promptId === promptId)
  if (!prompt) return null
  const task = taskAt(deriveTasks(events), prompt.ts)
  return task ? intentAt(task, prompt.ts) : null
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
    const task = taskAt(tasks, turn.startedAt)
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
