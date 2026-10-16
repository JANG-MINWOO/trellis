import { describe, expect, it } from 'vitest'
import {
  buildTimeline,
  comparePrediction,
  currentIntent,
  deriveAgentState,
  turnFiles,
  type TurnItem,
} from './timeline'
import type { TrellisEvent } from './types'

let seq = 0
function ev<E extends TrellisEvent>(
  partial: Omit<E, 'id' | 'projectId' | 'agent' | 'terminalId'> & Partial<E>,
): E {
  seq += 1
  return {
    id: `e${seq}`,
    projectId: 'p',
    agent: 'claude-code',
    terminalId: 't1',
    ...partial,
  } as E
}

const tool = (files: string[] = [], command: string | null = null) => ({
  tool: command ? 'Bash' : 'Edit',
  files,
  command,
  detail: null,
  durationMs: 5,
})

describe('buildTimeline', () => {
  it('groups tool uses into the turn of their prompt and marks it done on stop', () => {
    const items = buildTimeline([
      ev({
        kind: 'session.start',
        ts: 1,
        sessionId: 's',
        promptId: null,
        data: { source: 'startup', model: 'opus' },
      }),
      ev({
        kind: 'prompt.submit',
        ts: 2,
        sessionId: 's',
        promptId: 'p1',
        data: { prompt: 'fix it' },
      }),
      ev({ kind: 'tool.use', ts: 3, sessionId: 's', promptId: 'p1', data: tool(['a.ts']) }),
      ev({ kind: 'tool.use', ts: 4, sessionId: 's', promptId: 'p1', data: tool(['a.ts', 'b.ts']) }),
      ev({
        kind: 'turn.stop',
        ts: 5,
        sessionId: 's',
        promptId: 'p1',
        data: { lastMessage: 'done' },
      }),
    ])
    expect(items.map((i) => i.type)).toEqual(['session', 'turn'])
    const turn = items[1] as TurnItem
    expect(turn.status).toBe('done')
    expect(turn.files).toEqual(['a.ts', 'b.ts'])
    expect(turn.tools).toHaveLength(2)
    expect(turn.lastMessage).toBe('done')
    expect(turn.endedAt).toBe(5)
  })

  it('falls back to the open turn of the session when promptId is missing', () => {
    const items = buildTimeline([
      ev({ kind: 'prompt.submit', ts: 1, sessionId: 's', promptId: null, data: { prompt: 'x' } }),
      ev({ kind: 'tool.use', ts: 2, sessionId: 's', promptId: null, data: tool(['c.ts']) }),
    ])
    expect((items[0] as TurnItem).files).toEqual(['c.ts'])
    expect((items[0] as TurnItem).status).toBe('running')
  })

  it('marks a turn waiting on a permission prompt and running again on the next tool', () => {
    const base = [
      ev({ kind: 'prompt.submit', ts: 1, sessionId: 's', promptId: 'p', data: { prompt: 'x' } }),
      ev({
        kind: 'notification',
        ts: 2,
        sessionId: 's',
        promptId: null,
        data: { type: 'permission_prompt', message: 'ok?', needsInput: true },
      }),
    ]
    const waiting = buildTimeline(base)[0] as TurnItem
    expect(waiting.status).toBe('waiting')
    expect(waiting.waitingMessage).toBe('ok?')
    const resumed = buildTimeline([
      ...base,
      ev({ kind: 'tool.use', ts: 3, sessionId: 's', promptId: 'p', data: tool([], 'ls') }),
    ])[0] as TurnItem
    expect(resumed.status).toBe('running')
  })

  it('treats a new prompt or session end as interrupting the open turn', () => {
    const items = buildTimeline([
      ev({ kind: 'prompt.submit', ts: 1, sessionId: 's', promptId: 'p1', data: { prompt: 'a' } }),
      ev({ kind: 'prompt.submit', ts: 2, sessionId: 's', promptId: 'p2', data: { prompt: 'b' } }),
      ev({
        kind: 'session.end',
        ts: 3,
        sessionId: 's',
        promptId: null,
        data: { reason: 'prompt_input_exit' },
      }),
    ])
    expect((items[0] as TurnItem).status).toBe('interrupted')
    expect((items[1] as TurnItem).status).toBe('interrupted')
    expect(items[2]?.type).toBe('session')
  })

  it('attaches git-observed changes to their turn and prefers them over tool reports', () => {
    const items = buildTimeline([
      ev({ kind: 'prompt.submit', ts: 1, sessionId: 's', promptId: 'p', data: { prompt: 'x' } }),
      ev({ kind: 'tool.use', ts: 2, sessionId: 's', promptId: 'p', data: tool(['a.ts']) }),
      ev({ kind: 'turn.stop', ts: 3, sessionId: 's', promptId: 'p', data: { lastMessage: '' } }),
      ev({
        kind: 'turn.changes',
        ts: 4,
        sessionId: 's',
        promptId: 'p',
        data: {
          truncated: false,
          files: [
            { path: 'a.ts', oldPath: null, status: 'M', additions: 1, deletions: 0, binary: false },
            {
              path: 'log.md',
              oldPath: null,
              status: 'A',
              additions: 3,
              deletions: 0,
              binary: false,
            },
          ],
        },
      }),
    ])
    const turn = items[0] as TurnItem
    expect(turn.terminalId).toBe('t1')
    expect(turnFiles(turn)).toEqual([
      { path: 'a.ts', status: 'M' },
      { path: 'log.md', status: 'A' },
    ])
  })

  it('attaches analysis results and compares the prediction', () => {
    const items = buildTimeline([
      ev({
        kind: 'intent.set',
        ts: 1,
        sessionId: null,
        promptId: null,
        data: { text: 't', predictedAreas: ['src/auth', 'docs'] },
      }),
      ev({ kind: 'prompt.submit', ts: 2, sessionId: 's', promptId: 'p', data: { prompt: 'x' } }),
      ev({ kind: 'turn.stop', ts: 3, sessionId: 's', promptId: 'p', data: { lastMessage: '' } }),
      ev({
        kind: 'turn.changes',
        ts: 4,
        sessionId: 's',
        promptId: 'p',
        data: {
          truncated: false,
          files: [
            {
              path: 'src/auth/lock.ts',
              oldPath: null,
              status: 'M',
              additions: 1,
              deletions: 0,
              binary: false,
            },
            {
              path: 'src/db/schema.ts',
              oldPath: null,
              status: 'M',
              additions: 1,
              deletions: 0,
              binary: false,
            },
          ],
        },
      }),
      ev({
        kind: 'decision.candidate',
        ts: 5,
        sessionId: 's',
        promptId: 'p',
        data: {
          candidateId: 'c1',
          source: 'analysis',
          title: 'Lock accounts',
          what: '',
          whyGuess: '',
          alternatives: '',
          consequences: '',
          kind: 'security',
          risk: 'high',
          files: [],
        },
      }),
      ev({
        kind: 'analysis.run',
        ts: 6,
        sessionId: 's',
        promptId: 'p',
        data: {
          status: 'ok',
          durationMs: 10,
          model: 'sonnet',
          decisions: 1,
          behaviors: 0,
          message: null,
        },
      }),
    ])
    const turn = items.find((i) => i.type === 'turn') as TurnItem
    expect(turn.decisions.map((d) => d.title)).toEqual(['Lock accounts'])
    expect(turn.analysis?.status).toBe('ok')
    expect(comparePrediction(turn)).toEqual({
      hit: ['src/auth'],
      unpredicted: ['src/db'],
      untouched: ['docs'],
    })
  })

  it('sorts events by time before building', () => {
    const items = buildTimeline([
      ev({ kind: 'turn.stop', ts: 3, sessionId: 's', promptId: 'p', data: { lastMessage: '' } }),
      ev({ kind: 'prompt.submit', ts: 1, sessionId: 's', promptId: 'p', data: { prompt: 'a' } }),
    ])
    expect((items[0] as TurnItem).status).toBe('done')
    expect((items[0] as TurnItem).lastMessage).toBeNull()
  })
})

describe('deriveAgentState', () => {
  it('reports the state of the latest turn for the session', () => {
    const items = buildTimeline([
      ev({ kind: 'prompt.submit', ts: 1, sessionId: 'a', promptId: 'p1', data: { prompt: 'x' } }),
      ev({ kind: 'prompt.submit', ts: 2, sessionId: 'b', promptId: 'p2', data: { prompt: 'y' } }),
      ev({ kind: 'turn.stop', ts: 3, sessionId: 'b', promptId: 'p2', data: { lastMessage: '' } }),
    ])
    expect(deriveAgentState(items, 'a')).toBe('working')
    expect(deriveAgentState(items, 'b')).toBe('idle')
    expect(deriveAgentState([], null)).toBe('idle')
  })
})

describe('currentIntent', () => {
  it('returns the latest intent', () => {
    const intent = currentIntent([
      ev({ kind: 'intent.set', ts: 1, sessionId: null, promptId: null, data: { text: 'old' } }),
      ev({ kind: 'intent.set', ts: 5, sessionId: null, promptId: null, data: { text: 'new' } }),
    ])
    expect(intent?.data.text).toBe('new')
  })
})
