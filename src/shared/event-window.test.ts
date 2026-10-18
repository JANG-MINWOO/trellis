import { describe, expect, it } from 'vitest'
import { appendToWindow, isPinnedLine } from './event-window'
import type { TrellisEvent } from './types'

const ev = (id: string, kind: 'prompt.submit' | 'intent.set'): TrellisEvent =>
  ({
    id,
    ts: 0,
    projectId: 'p',
    agent: 'trellis',
    sessionId: null,
    promptId: null,
    terminalId: null,
    kind,
    data: kind === 'intent.set' ? { text: 'x' } : { prompt: 'x' },
  }) as TrellisEvent

describe('appendToWindow', () => {
  it('drops the oldest event that is not an intent once the window is full', () => {
    const list = [ev('i', 'intent.set'), ev('a', 'prompt.submit'), ev('b', 'prompt.submit')]
    expect(appendToWindow(list, ev('c', 'prompt.submit'), 5).map((e) => e.id)).toEqual([
      'i',
      'a',
      'b',
      'c',
    ])
    expect(appendToWindow(list, ev('c', 'prompt.submit'), 3).map((e) => e.id)).toEqual([
      'i',
      'b',
      'c',
    ])
  })

  it('recognizes intent events on the raw ledger line', () => {
    expect(isPinnedLine(JSON.stringify(ev('i', 'intent.set')))).toBe(true)
    expect(isPinnedLine(JSON.stringify(ev('a', 'prompt.submit')))).toBe(false)
  })
})
