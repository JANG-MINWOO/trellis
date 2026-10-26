import { describe, expect, it } from 'vitest'
import { checkTask, TASK_IDLE_MS } from './task-check'
import { lastTaskOf, taskProgress, untaskedSince } from './task-progress'
import {
  deriveTasks,
  intentAt,
  intentForPrompt,
  openConversations,
  taskForTab,
  taskOfTurn,
  tasksElsewhere,
  waitingTaskFor,
  type Task,
} from './tasks'
import { buildTimeline, type TurnItem } from './timeline'
import type { AnalysisRun, IntentData, TrellisEvent } from './types'

let seq = 0
/** Where an event happened: the conversation (session) and the tab. */
interface At {
  session?: string | null
  tab?: string | null
}
const base = (ts: number, promptId: string | null = null, at: At = {}) => ({
  id: `e${++seq}`,
  ts,
  projectId: 'p',
  agent: 'trellis' as const,
  sessionId: at.session === undefined ? 's' : at.session,
  promptId,
  terminalId: at.tab === undefined ? 't1' : at.tab,
})

/** An intent from before ADR-0035: no scope, it covers the whole project. */
const intent = (ts: number, data: Partial<IntentData>): TrellisEvent => ({
  ...base(ts, null, { session: null, tab: null }),
  kind: 'intent.set',
  data: { text: data.goal ?? 'intent', ...data },
})
/** An intent written in a conversation (ADR-0035). */
const write = (ts: number, data: Partial<IntentData>, at: At = {}): TrellisEvent => ({
  ...base(ts, null, at),
  kind: 'intent.set',
  data: { text: data.goal ?? 'intent', scope: 'conversation', ...data },
})
const done = (ts: number, taskId: string, at = ts): TrellisEvent => ({
  ...base(ts),
  kind: 'intent.done',
  data: { taskId, at },
})
const keep = (ts: number, taskId: string, at: At = {}, from?: number): TrellisEvent => ({
  ...base(ts, null, at),
  kind: 'intent.continue',
  data: from === undefined ? { taskId } : { taskId, from },
})

/** A finished turn that changed `files`, optionally with what the analysis said. */
function turn(
  ts: number,
  id: string,
  files: string[],
  analysis?: Partial<AnalysisRun>,
  at: At = {},
): TrellisEvent[] {
  const out: TrellisEvent[] = [
    { ...base(ts, id, at), kind: 'prompt.submit', data: { prompt: `prompt ${id}` } },
    { ...base(ts + 1, id, at), kind: 'turn.stop', data: { lastMessage: '' } },
    {
      ...base(ts + 1, id, at),
      kind: 'turn.changes',
      data: {
        truncated: false,
        files: files.map((path) => ({
          path,
          oldPath: null,
          status: 'M' as const,
          additions: 1,
          deletions: 0,
          binary: false,
        })),
      },
    },
  ]
  if (analysis) {
    out.push({
      ...base(ts + 2, id, at),
      kind: 'analysis.run',
      data: {
        status: 'ok',
        durationMs: 1,
        model: 'sonnet',
        decisions: 0,
        behaviors: 0,
        message: null,
        ...analysis,
      },
    })
  }
  return out
}

function build(events: TrellisEvent[]): { tasks: Task[]; turns: TurnItem[] } {
  const turns = buildTimeline(events).filter((i): i is TurnItem => i.type === 'turn')
  return { tasks: deriveTasks(events), turns }
}
const taskOf = (events: TrellisEvent[], key: string): string | null =>
  build(events).turns.find((t) => t.key === key)?.taskId ?? null

describe('tasks from before conversations (project-wide)', () => {
  it('treats each intent written before tasks existed as its own task', () => {
    const tasks = deriveTasks([intent(1, { goal: 'a' }), intent(10, { goal: 'b' })])
    expect(tasks.map((t) => [t.scope, t.startedAt, t.endedAt, t.done])).toEqual([
      ['project', 1, 10, false],
      ['project', 10, null, false],
    ])
    // Any tab, and no tab, sees the project's task.
    expect(taskForTab(tasks, { terminalId: 'x', sessionId: 'y' })?.revisions[0]?.data.goal).toBe(
      'b',
    )
    expect(taskForTab(tasks, null)?.revisions[0]?.data.goal).toBe('b')
  })

  it('keeps refinements in the task and gives each moment the intent it had then', () => {
    const tasks = deriveTasks([
      intent(10, { goal: 'first', taskId: 'A' }),
      intent(20, { goal: 'refined', taskId: 'A' }),
    ])
    expect(tasks).toHaveLength(1)
    expect(intentAt(tasks[0]!, 15).goal).toBe('first')
    expect(intentAt(tasks[0]!, 25).goal).toBe('refined')
    // Taken in from before the first revision: the first one.
    expect(intentAt(tasks[0]!, 5).goal).toBe('first')
  })

  it('ends a task where the human said, and leaves the gap outside any task', () => {
    const tasks = deriveTasks([intent(10, { taskId: 'A' }), done(30, 'A', 20)])
    expect(tasks[0]).toMatchObject({ endedAt: 20, done: true })
    expect(taskOfTurn(tasks, 's', 15)?.taskId).toBe('A')
    expect(taskOfTurn(tasks, 's', 25)).toBeNull()
    expect(taskForTab(tasks, null)).toBeNull()
  })

  it('starts a new task from an earlier moment when asked, and never in the future', () => {
    const tasks = deriveTasks([
      intent(10, { taskId: 'A' }),
      done(40, 'A', 30),
      intent(41, { taskId: 'B', from: 30 }),
      intent(50, { taskId: 'C', from: 99 }),
    ])
    expect(tasks.map((t) => [t.taskId, t.startedAt, t.endedAt])).toEqual([
      ['A', 10, 30],
      ['B', 30, 50],
      ['C', 50, null],
    ])
  })

  it('opens the last task again when it is refined after being finished', () => {
    const tasks = deriveTasks([
      intent(10, { taskId: 'A' }),
      done(20, 'A'),
      intent(30, { taskId: 'A' }),
    ])
    expect(taskForTab(tasks, null)?.taskId).toBe('A')
    expect(tasks[0]).toMatchObject({ endedAt: null, done: false })
  })

  it('ends with the first task written in a conversation', () => {
    const events = [
      intent(10, { taskId: 'old' }),
      ...turn(20, 'p1', ['a.ts'], undefined, { session: 's2' }),
      write(30, { taskId: 'new' }, { session: 's1' }),
      ...turn(40, 'p2', ['a.ts'], undefined, { session: 's2' }),
    ]
    expect(deriveTasks(events)[0]).toMatchObject({ endedAt: 30, done: false })
    expect(taskOf(events, 'p1')).toBe('old')
    expect(taskOf(events, 'p2')).toBeNull()
  })
})

describe('tasks per conversation', () => {
  const s1 = { session: 's1', tab: 't1' }
  const s2 = { session: 's2', tab: 't2' }

  it('gives each conversation its own task, at the same time', () => {
    const events = [
      write(10, { taskId: 'A' }, s1),
      write(11, { taskId: 'B' }, s2),
      ...turn(20, 'p1', ['a.ts'], undefined, s1),
      ...turn(21, 'p2', ['b.ts'], undefined, s2),
      ...turn(22, 'p3', ['c.ts'], undefined, { session: 's3', tab: 't3' }),
    ]
    expect(taskOf(events, 'p1')).toBe('A')
    expect(taskOf(events, 'p2')).toBe('B')
    expect(taskOf(events, 'p3')).toBeNull()
    const tasks = deriveTasks(events)
    expect(taskForTab(tasks, { terminalId: 't1', sessionId: 's1' })?.taskId).toBe('A')
    expect(taskForTab(tasks, { terminalId: 't2', sessionId: 's2' })?.taskId).toBe('B')
    expect(taskForTab(tasks, { terminalId: 't3', sessionId: 's3' })).toBeNull()
    expect(
      tasksElsewhere(tasks, { terminalId: 't3', sessionId: 's3' }).map((t) => t.taskId),
    ).toEqual(['B', 'A'])
  })

  it('brings the task back with its conversation, however much happened elsewhere', () => {
    const events = [
      write(10, { taskId: 'A', goal: 'login lock' }, s1),
      ...turn(20, 'p1', ['a.ts'], undefined, s1),
      write(30, { taskId: 'B' }, s2),
      ...turn(40, 'p2', ['b.ts'], undefined, s2),
      // Days later, s1 is opened again (same conversation id) in another tab.
      ...turn(100, 'p3', ['a.ts'], undefined, { session: 's1', tab: 't9' }),
    ]
    expect(taskOf(events, 'p3')).toBe('A')
    const tasks = deriveTasks(events)
    expect(taskForTab(tasks, { terminalId: 't9', sessionId: 's1' })?.revisions[0]?.data.goal).toBe(
      'login lock',
    )
  })

  it('replaces the task of the same conversation only, and finishing ends it everywhere', () => {
    const events = [
      write(10, { taskId: 'A' }, s1),
      keep(15, 'A', s2),
      write(20, { taskId: 'C' }, s1),
      ...turn(30, 'p1', ['a.ts'], undefined, s1),
      ...turn(31, 'p2', ['a.ts'], undefined, s2),
    ]
    expect(taskOf(events, 'p1')).toBe('C')
    expect(taskOf(events, 'p2')).toBe('A')
    const a = deriveTasks(events)[0]!
    expect(a.endedAt).toBeNull()
    expect(openConversations(a)).toEqual(['s2'])

    const later = [...events, done(40, 'A'), ...turn(50, 'p3', ['a.ts'], undefined, s2)]
    expect(deriveTasks(later)[0]).toMatchObject({ endedAt: 40, done: true })
    expect(taskOf(later, 'p3')).toBeNull()
  })

  it('ends a task its only conversation left, without calling it finished', () => {
    const tasks = deriveTasks([write(10, { taskId: 'A' }, s1), write(20, { taskId: 'B' }, s1)])
    expect(tasks[0]).toMatchObject({ endedAt: 20, done: false })
    expect(tasks[1]).toMatchObject({ endedAt: null })
  })

  it('takes a task into another conversation along with its turns that had none', () => {
    const events = [
      write(10, { taskId: 'A' }, s1),
      ...turn(20, 'p1', ['a.ts'], undefined, s2),
      ...turn(30, 'p2', ['a.ts'], undefined, s2),
    ]
    const { turns } = build(events)
    expect(untaskedSince(turns, 's2')).toBe(20)
    expect(untaskedSince(turns, 's1')).toBeNull()
    const taken = [...events, keep(40, 'A', s2, 20), ...turn(50, 'p3', ['a.ts'], undefined, s2)]
    expect(['p1', 'p2', 'p3'].map((k) => taskOf(taken, k))).toEqual(['A', 'A', 'A'])
    expect(openConversations(deriveTasks(taken)[0]!)).toEqual(['s1', 's2'])
  })

  it('lets a task wait for its tab, then ties it to the conversation main reports', () => {
    const noSession = { session: null, tab: 't1' }
    const events = [write(10, { taskId: 'A' }, noSession)]
    let tasks = deriveTasks(events)
    expect(tasks[0]!.waiting).toEqual({ terminalId: 't1', from: 10 })
    expect(waitingTaskFor(tasks, 't1')?.taskId).toBe('A')
    expect(waitingTaskFor(tasks, 't2')).toBeNull()
    // The card of that tab shows it before its conversation is known.
    expect(taskForTab(tasks, { terminalId: 't1', sessionId: null })?.taskId).toBe('A')

    // Main ties it on the tab's next prompt: the turn is in the task.
    const tied = [...events, ...turn(20, 'p1', ['a.ts'], undefined, s1), keep(21, 'A', s1, 10)]
    tasks = deriveTasks(tied)
    expect(tasks[0]!.waiting).toBeNull()
    expect(taskOf(tied, 'p1')).toBe('A')
    expect(waitingTaskFor(tasks, 't1')).toBeNull()
  })

  it('replaces a task still waiting for the same tab, and serves any tab when written without one', () => {
    const tasks = deriveTasks([
      write(10, { taskId: 'A' }, { session: null, tab: 't1' }),
      write(20, { taskId: 'B' }, { session: null, tab: 't1' }),
      write(30, { taskId: 'C' }, { session: null, tab: null }),
    ])
    expect(tasks[0]).toMatchObject({ endedAt: 20, waiting: null })
    expect(waitingTaskFor(tasks, 't1')?.taskId).toBe('B')
    expect(waitingTaskFor(tasks, 't2')?.taskId).toBe('C')
    expect(waitingTaskFor(tasks, null)?.taskId).toBe('C')
  })

  it('reopens a finished task in the conversation that reopened it', () => {
    const tasks = deriveTasks([
      write(10, { taskId: 'A' }, s1),
      done(20, 'A'),
      write(30, { taskId: 'A' }, s2),
    ])
    expect(tasks[0]).toMatchObject({ endedAt: null, done: false })
    expect(openConversations(tasks[0]!)).toEqual(['s2'])
  })

  it('finds the latest task of a conversation for the wrap-up', () => {
    const events = [
      write(10, { taskId: 'A' }, s1),
      ...turn(20, 'p1', ['a.ts'], undefined, s1),
      done(30, 'A'),
    ]
    const { tasks, turns } = build(events)
    expect(lastTaskOf(tasks, turns, 's1')?.taskId).toBe('A')
    expect(lastTaskOf(tasks, turns, 's2')).toBeNull()
  })
})

describe('turns in tasks', () => {
  const events = [
    intent(10, { taskId: 'A', predictedAreas: ['src/a', 'src/b'], mustNot: 'keep tokens' }),
    ...turn(20, 'p1', ['src/a/x.ts', 'docs/x.md'], {
      mustNotBroken: [{ rule: 'keep tokens', why: 'first' }],
    }),
    // The human adds docs to the prediction after it already changed: still unexpected.
    intent(30, { taskId: 'A', predictedAreas: ['src/a', 'src/b', 'docs'] }),
    ...turn(40, 'p2', ['docs/y.md', 'src/a/y.ts'], {
      mustNotBroken: [{ rule: 'keep tokens', why: 'latest' }],
    }),
    ...turn(50, 'p3', ['tests/a.test.ts']),
  ]

  it('shows per turn only the areas that are new to the task and unexpected', () => {
    const { turns } = build(events)
    expect(turns.map((t) => t.prediction)).toEqual([
      { unexpected: ['docs'], withinPrediction: false, missedAll: false },
      { unexpected: [], withinPrediction: true, missedAll: false },
      { unexpected: ['tests'], withinPrediction: false, missedAll: true },
    ])
  })

  it('sums the task up by the prediction in force when each area first changed', () => {
    const { tasks, turns } = build(events)
    const progress = taskProgress(tasks[0]!, turns)
    expect(progress).toMatchObject({
      turns: 3,
      turnKeys: ['p1', 'p2', 'p3'],
      changed: ['src/a', 'docs', 'tests'],
      hit: ['src/a'],
      unexpected: ['docs', 'tests'],
      untouched: ['src/b'],
      predicted: true,
      mustNotBroken: [{ rule: 'keep tokens', why: 'latest' }],
    })
  })

  it('gives the analysis the intent of the task the prompt belongs to', () => {
    const later = [...events, done(60, 'A'), ...turn(70, 'p4', ['a.ts'])]
    expect(intentForPrompt(later, 'p1')?.mustNot).toBe('keep tokens')
    expect(intentForPrompt(later, 'p4')).toBeNull()
    // In conversations, the prompt's own conversation decides.
    const two = [
      write(80, { taskId: 'X', goal: 'x' }, { session: 's1' }),
      write(81, { taskId: 'Y', goal: 'y' }, { session: 's2' }),
      ...turn(90, 'q1', ['a.ts'], undefined, { session: 's2' }),
    ]
    expect(intentForPrompt(two, 'q1')?.goal).toBe('y')
  })
})

describe('checkTask', () => {
  const ask = (events: TrellisEvent[], now = 1000) => {
    const { tasks, turns } = build(events)
    return checkTask(taskForTab(tasks, { terminalId: 't1', sessionId: 's' })!, turns, now)
  }
  const start = write(10, { taskId: 'A', predictedAreas: ['src/a'] })

  it('does not ask about a fresh task or one going as predicted', () => {
    expect(ask([start])).toBeNull()
    expect(
      ask([start, ...turn(20, 'p1', ['src/a/x.ts']), ...turn(30, 'p2', ['src/a/y.ts'])]),
    ).toBeNull()
  })

  it('asks after a long break, before or at the next turn, until the human answers', () => {
    expect(ask([start, ...turn(20, 'p1', ['src/a/x.ts'])], 21 + TASK_IDLE_MS + 1)).toEqual({
      reason: 'idle',
      boundary: 22,
    })
    const later = 30 + TASK_IDLE_MS
    const events = [start, ...turn(20, 'p1', ['src/a/x.ts']), ...turn(later, 'p2', ['src/a/y.ts'])]
    expect(ask(events, later + 5)).toEqual({ reason: 'idle', boundary: later })
    expect(ask([...events, keep(later + 10, 'A')], later + 20)).toBeNull()
  })

  it('asks when the analysis reads the request as different work', () => {
    const events = [
      start,
      ...turn(20, 'p1', ['src/a/x.ts'], { intentFit: 'yes' }),
      ...turn(30, 'p2', ['src/a/y.ts'], { intentFit: 'no' }),
    ]
    expect(ask(events)).toEqual({ reason: 'off-intent', boundary: 30 })
  })

  it('falls back to the prediction only without the analysis saying it continues', () => {
    const away = turn(30, 'p2', ['lib/z.ts'])
    expect(ask([start, ...turn(20, 'p1', ['src/a/x.ts']), ...away])).toEqual({
      reason: 'off-prediction',
      boundary: 30,
    })
    expect(
      ask([
        start,
        ...turn(20, 'p1', ['src/a/x.ts']),
        ...turn(30, 'p2', ['lib/z.ts'], { intentFit: 'yes' }),
      ]),
    ).toBeNull()
  })

  it('reports the earliest signal, and nothing for a finished task', () => {
    const events = [
      start,
      ...turn(20, 'p1', ['src/a/x.ts']),
      ...turn(30, 'p2', ['lib/z.ts']),
      ...turn(40, 'p3', ['src/a/y.ts'], { intentFit: 'no' }),
    ]
    expect(ask(events)?.boundary).toBe(30)
    const { tasks, turns } = build([...events, done(50, 'A')])
    expect(checkTask(tasks[0]!, turns, 1000)).toBeNull()
  })
})
