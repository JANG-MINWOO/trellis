import { describe, expect, it } from 'vitest'
import { summarizeConversations } from './conversations'
import type { TrellisEvent } from './types'

let seq = 0
const ev = (ts: number, session: string | null, rest: object): TrellisEvent =>
  ({
    id: `e${++seq}`,
    ts,
    projectId: 'p',
    agent: 'trellis',
    sessionId: session,
    promptId: null,
    terminalId: 't1',
    ...rest,
  }) as TrellisEvent
const prompt = (ts: number, session: string, text: string): TrellisEvent =>
  ev(ts, session, { kind: 'prompt.submit', data: { prompt: text } })

describe('summarizeConversations', () => {
  it('lists conversations with prompts, most recently active first, titled by their task', () => {
    const events = [
      prompt(10, 'a', '\n  fix the login page\nmore'),
      ev(11, 'a', { kind: 'turn.stop', data: { lastMessage: '' } }),
      ev(20, 'b', {
        kind: 'intent.set',
        data: { text: 'x', goal: 'lock accounts', scope: 'conversation', taskId: 'T' },
      }),
      prompt(30, 'b', 'start'),
      prompt(40, 'b', 'go on'),
      ev(45, 'b', { kind: 'turn.stop', data: { lastMessage: '' } }),
      ev(50, 'c', { kind: 'session.start', data: { source: 'startup', model: null } }),
    ]
    expect(summarizeConversations(events)).toEqual([
      {
        sessionId: 'b',
        startedAt: 30,
        lastAt: 45,
        turns: 2,
        title: 'lock accounts',
        task: { taskId: 'T', state: 'open' },
      },
      {
        sessionId: 'a',
        startedAt: 10,
        lastAt: 11,
        turns: 1,
        title: 'fix the login page',
        task: null,
      },
    ])
  })

  it('tells a finished task from one the conversation left', () => {
    const events = [
      ev(10, 'a', {
        kind: 'intent.set',
        data: { text: 'one', scope: 'conversation', taskId: 'A' },
      }),
      prompt(20, 'a', 'p'),
      ev(30, 'a', { kind: 'intent.continue', data: { taskId: 'A' } }),
      ev(40, 'b', {
        kind: 'intent.set',
        data: { text: 'two', scope: 'conversation', taskId: 'B' },
      }),
      prompt(50, 'b', 'p'),
      ev(60, null, { kind: 'intent.done', data: { taskId: 'B', at: 60 } }),
      ev(70, 'a', {
        kind: 'intent.set',
        data: { text: 'three', scope: 'conversation', taskId: 'C' },
      }),
      ev(71, 'b', { kind: 'intent.continue', data: { taskId: 'C' } }),
      ev(72, 'b', {
        kind: 'intent.set',
        data: { text: 'four', scope: 'conversation', taskId: 'D' },
      }),
    ]
    const byId = Object.fromEntries(summarizeConversations(events).map((c) => [c.sessionId, c]))
    expect(byId.a?.task).toEqual({ taskId: 'C', state: 'open' })
    // b took C over, then moved on to D before any prompt: D is its latest task.
    expect(byId.b?.task).toEqual({ taskId: 'D', state: 'open' })
    expect(byId.b?.title).toBe('four')
  })
})
