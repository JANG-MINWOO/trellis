// Tasks (ADR-0034, ADR-0035): an intent is written for one piece of work in a Claude conversation.
// The work starts, may be refined, may be taken into other conversations, and ends. Which
// conversation each task covers and when is computed from the ledger.
import type { EventOf, IntentData, TrellisEvent } from './types'

/** A stretch of one conversation that belongs to a task. */
export interface Span {
  sessionId: string
  from: number
  /** Null while the conversation is still on the task. */
  to: number | null
}

export interface Task {
  taskId: string
  /** The intent as written and refined, oldest first. */
  revisions: EventOf<'intent.set'>[]
  /**
   * 'project' for intents written before ADR-0035: they cover every conversation, one task at a
   * time, by time alone.
   */
  scope: 'project' | 'conversation'
  startedAt: number
  /** Null while the task is in progress. */
  endedAt: number | null
  /** The human ended it (others were replaced by the next task). */
  done: boolean
  /** Last time the human answered "still this task" or took it into a conversation. */
  continuedAt: number | null
  /** The conversations the task covers (conversation tasks only). */
  spans: Span[]
  /**
   * Written while the tab's conversation was unknown: the tab (null: any tab) whose next prompt
   * ties the task to its conversation. Main records that with an `intent.continue`.
   */
  waiting: { terminalId: string | null; from: number } | null
}

/** A Claude tab as tasks see it. */
export interface TabRef {
  terminalId: string | null
  sessionId: string | null
}

/** Intents written before ADR-0034 have no task id: each one is its own task. */
const taskIdOf = (e: EventOf<'intent.set'>): string => e.data.taskId || e.id
const startOf = (from: number | undefined, ts: number): number => Math.min(from ?? ts, ts)

export function deriveTasks(events: readonly TrellisEvent[]): Task[] {
  const tasks: Task[] = []
  const byId = new Map<string, Task>()
  /** Conversation → the task it is on now. */
  const current = new Map<string, Task>()
  let lastProject: Task | null = null

  const end = (task: Task, at: number, done: boolean): void => {
    task.endedAt = Math.max(at, task.startedAt)
    task.done = done
    task.waiting = null
    for (const s of task.spans) if (s.to === null || s.to > task.endedAt) s.to = task.endedAt
    for (const s of task.spans) s.to = Math.max(s.to!, s.from)
    for (const [sessionId, t] of current) if (t === task) current.delete(sessionId)
  }
  // The conversation moves to `task` from `at`; the task it leaves ends once no conversation and
  // no tab is on it any more.
  const enter = (sessionId: string, task: Task, at: number): void => {
    const prev = current.get(sessionId)
    if (prev === task) return
    if (prev) {
      for (const s of prev.spans)
        if (s.sessionId === sessionId && s.to === null) s.to = Math.max(at, s.from)
      if (!prev.waiting && !prev.spans.some((s) => s.to === null)) end(prev, at, false)
    }
    task.spans.push({ sessionId, from: at, to: null })
    current.set(sessionId, task)
  }
  const wait = (task: Task, terminalId: string | null, from: number): void => {
    // A tab waits for one task: an earlier one written for it and never tied is replaced.
    for (const t of tasks)
      if (t !== task && t.endedAt === null && t.waiting?.terminalId === terminalId) {
        t.waiting = null
        if (!t.spans.some((s) => s.to === null)) end(t, from, false)
      }
    task.waiting = { terminalId, from }
  }
  const openProject = (): Task | null =>
    lastProject && lastProject.endedAt === null ? lastProject : null

  const intents = events.filter((e) => e.kind.startsWith('intent.')).sort((a, b) => a.ts - b.ts)
  for (const e of intents) {
    if (e.kind === 'intent.set') {
      const known = byId.get(taskIdOf(e))
      if (known) {
        known.revisions.push(e)
        if (known.endedAt === null) continue
        // Refining a finished task opens it again (a project task only while it is the last).
        if (known.scope === 'project') {
          if (known !== lastProject) continue
          known.endedAt = null
          known.done = false
        } else {
          known.endedAt = null
          known.done = false
          if (e.sessionId) enter(e.sessionId, known, e.ts)
          else wait(known, e.terminalId, e.ts)
        }
        continue
      }
      const task: Task = {
        taskId: taskIdOf(e),
        revisions: [e],
        scope: e.data.scope === 'conversation' ? 'conversation' : 'project',
        startedAt: startOf(e.data.from, e.ts),
        endedAt: null,
        done: false,
        continuedAt: null,
        spans: [],
        waiting: null,
      }
      if (task.scope === 'project') {
        task.startedAt = Math.max(task.startedAt, lastProject ? lastProject.startedAt + 1 : 0)
        // A new project task ends the previous one where it starts, at the latest.
        if (lastProject && (lastProject.endedAt === null || lastProject.endedAt > task.startedAt))
          lastProject.endedAt = task.startedAt
        lastProject = task
      } else {
        const project = openProject()
        if (project) end(project, task.startedAt, false)
        if (e.sessionId) enter(e.sessionId, task, task.startedAt)
        else wait(task, e.terminalId, task.startedAt)
      }
      tasks.push(task)
      byId.set(task.taskId, task)
    } else if (e.kind === 'intent.done') {
      const task = byId.get(e.data.taskId)
      if (task && task.endedAt === null) end(task, Math.min(e.data.at, e.ts), true)
    } else if (e.kind === 'intent.continue') {
      const task = byId.get(e.data.taskId)
      if (!task) continue
      task.continuedAt = e.ts
      if (task.endedAt !== null || task.scope === 'project') continue
      const at = Math.max(startOf(e.data.from, e.ts), task.startedAt)
      if (!e.sessionId) {
        wait(task, e.terminalId, at)
        continue
      }
      if (task.waiting && (task.waiting.terminalId ?? e.terminalId) === e.terminalId)
        task.waiting = null
      enter(e.sessionId, task, at)
    }
  }
  return tasks
}

/** The task a turn of `sessionId` at `ts` belongs to, or null outside any task. */
export function taskOfTurn(
  tasks: readonly Task[],
  sessionId: string | null,
  ts: number,
): Task | null {
  let found: Task | null = null
  let since = -Infinity
  for (const task of tasks)
    for (const s of task.spans)
      if (
        s.sessionId === sessionId &&
        s.from <= ts &&
        (s.to === null || ts < s.to) &&
        s.from >= since
      ) {
        found = task
        since = s.from
      }
  if (found) return found
  // Project tasks follow one another, so the latest one started decides.
  for (let i = tasks.length - 1; i >= 0; i--) {
    const task = tasks[i]!
    if (task.scope !== 'project' || task.startedAt > ts) continue
    return task.endedAt === null || ts < task.endedAt ? task : null
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

const isOpen = (task: Task): boolean => task.endedAt === null

/** Conversations the task is on now. */
export const openConversations = (task: Task): string[] =>
  task.spans.filter((s) => s.to === null).map((s) => s.sessionId)

/** The open task waiting for this tab's next prompt (one written for any tab comes second). */
export function waitingTaskFor(tasks: readonly Task[], terminalId: string | null): Task | null {
  const open = tasks.filter((t) => isOpen(t) && t.waiting)
  return (
    open.findLast((t) => terminalId !== null && t.waiting!.terminalId === terminalId) ??
    open.findLast((t) => t.waiting!.terminalId === null) ??
    null
  )
}

/**
 * The task in progress for a Claude tab (or for no tab): one waiting for its next prompt, the
 * task its conversation is on, or a project task from before ADR-0035.
 */
export function taskForTab(tasks: readonly Task[], tab: TabRef | null): Task | null {
  const waiting = waitingTaskFor(tasks, tab?.terminalId ?? null)
  if (waiting) return waiting
  const sessionId = tab?.sessionId
  const mine = sessionId
    ? tasks.find((t) => isOpen(t) && openConversations(t).includes(sessionId))
    : undefined
  return mine ?? tasks.find((t) => isOpen(t) && t.scope === 'project') ?? null
}

/** Tasks in progress in other conversations, most recently started first: work to take over. */
export function tasksElsewhere(tasks: readonly Task[], tab: TabRef | null): Task[] {
  const here = taskForTab(tasks, tab)
  return tasks
    .filter((t) => isOpen(t) && t !== here && t.scope === 'conversation')
    .sort((a, b) => b.startedAt - a.startedAt)
}

/** The intent in force when this prompt was sent, or null outside any task. */
export function intentForPrompt(
  events: readonly TrellisEvent[],
  promptId: string,
): IntentData | null {
  const prompt = events.find((e) => e.kind === 'prompt.submit' && e.promptId === promptId)
  if (!prompt) return null
  const task = taskOfTurn(deriveTasks(events), prompt.sessionId, prompt.ts)
  return task ? intentAt(task, prompt.ts) : null
}
