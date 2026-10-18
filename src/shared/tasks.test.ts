import { describe, expect, it } from 'vitest'
import { checkTask, TASK_IDLE_MS } from './task-check'
import {
  activeTask,
  deriveTasks,
  intentAt,
  intentForPrompt,
  taskAt,
  taskProgress,
  type Task,
} from './tasks'
import { buildTimeline, type TurnItem } from './timeline'
import type { AnalysisRun, IntentData, TrellisEvent } from './types'

let seq = 0
const base = (ts: number, promptId: string | null = null) => ({
  id: `e${++seq}`,
  ts,
  projectId: 'p',
  agent: 'trellis' as const,
  sessionId: 's',
  promptId,
  terminalId: 't1',
})

const intent = (ts: number, data: Partial<IntentData>): TrellisEvent => ({
  ...base(ts),
  kind: 'intent.set',
  data: { text: data.goal ?? 'intent', ...data },
})
const done = (ts: number, taskId: string, at = ts): TrellisEvent => ({
  ...base(ts),
  kind: 'intent.done',
  data: { taskId, at },
})
const keep = (ts: number, taskId: string): TrellisEvent => ({
  ...base(ts),
  kind: 'intent.continue',
  data: { taskId },
})
const conversation = (ts: number, source: 'startup' | 'resume'): TrellisEvent => ({
  ...base(ts),
  kind: 'session.start',
  data: { source, model: null },
})

/** A finished turn that changed `files`, optionally with what the analysis said. */
function turn(
  ts: number,
  id: string,
  files: string[],
  analysis?: Partial<AnalysisRun>,
): TrellisEvent[] {
  const out: TrellisEvent[] = [
    { ...base(ts, id), kind: 'prompt.submit', data: { prompt: `prompt ${id}` } },
    { ...base(ts + 1, id), kind: 'turn.stop', data: { lastMessage: '' } },
    {
      ...base(ts + 1, id),
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
      ...base(ts + 2, id),
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

describe('deriveTasks', () => {
  it('treats each intent written before tasks existed as its own task', () => {
    const tasks = deriveTasks([intent(1, { goal: 'a' }), intent(10, { goal: 'b' })])
    expect(tasks.map((t) => [t.startedAt, t.endedAt, t.done])).toEqual([
      [1, 10, false],
      [10, null, false],
    ])
    expect(activeTask(tasks)?.revisions[0]?.data.goal).toBe('b')
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
    expect(taskAt(tasks, 15)?.taskId).toBe('A')
    expect(taskAt(tasks, 25)).toBeNull()
    expect(activeTask(tasks)).toBeNull()
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
    expect(activeTask(tasks)?.taskId).toBe('A')
    expect(tasks[0]).toMatchObject({ endedAt: null, done: false })
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
  })
})

describe('checkTask', () => {
  const ask = (events: TrellisEvent[], now = 1000) => {
    const { tasks, turns } = build(events)
    return checkTask(activeTask(tasks)!, turns, events, now)
  }
  const start = intent(10, { taskId: 'A', predictedAreas: ['src/a'] })

  it('does not ask about a fresh task or a resumed conversation', () => {
    expect(ask([start])).toBeNull()
    expect(ask([start, conversation(15, 'startup'), ...turn(20, 'p1', ['src/a/x.ts'])])).toBeNull()
    expect(ask([start, ...turn(20, 'p1', ['src/a/x.ts']), conversation(30, 'resume')])).toBeNull()
  })

  it('asks after a new conversation once the task had turns, until the human answers', () => {
    const events = [start, ...turn(20, 'p1', ['src/a/x.ts']), conversation(30, 'startup')]
    expect(ask(events)).toEqual({ reason: 'new-conversation', boundary: 30 })
    expect(ask([...events, keep(40, 'A')])).toBeNull()
  })

  it('asks after a long break, before or at the next turn', () => {
    expect(ask([start, ...turn(20, 'p1', ['src/a/x.ts'])], 21 + TASK_IDLE_MS + 1)).toEqual({
      reason: 'idle',
      boundary: 22,
    })
    const later = 30 + TASK_IDLE_MS
    expect(
      ask(
        [start, ...turn(20, 'p1', ['src/a/x.ts']), ...turn(later, 'p2', ['src/a/y.ts'])],
        later + 5,
      ),
    ).toEqual({ reason: 'idle', boundary: later })
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
      ...turn(30, 'p2', ['src/a/y.ts'], { intentFit: 'no' }),
      conversation(25, 'startup'),
    ]
    expect(ask(events)?.boundary).toBe(25)
    const { tasks, turns } = build([...events, done(40, 'A')])
    expect(checkTask(tasks[0]!, turns, events, 1000)).toBeNull()
  })
})
