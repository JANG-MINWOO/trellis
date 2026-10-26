import { describe, expect, it } from 'vitest'
import type { ConversationView } from '@shared/types'
import { chooseLaunch, isSessionId } from './conversations'

const view = (sessionId: string, available: boolean): ConversationView => ({
  sessionId,
  startedAt: 1,
  lastAt: 2,
  turns: 1,
  title: sessionId,
  task: null,
  available,
})

describe('chooseLaunch', () => {
  const base = {
    chosen: null,
    mode: 'continue' as const,
    otherClaudeRunning: false,
    conversations: async () => [view('gone', false), view('last', true), view('older', true)],
    hasPriorSession: async () => true,
  }

  it('opens the chosen conversation', async () => {
    expect(await chooseLaunch({ ...base, chosen: 'older' })).toEqual({
      mode: 'resume',
      sessionId: 'older',
    })
  })

  it('continues the last conversation used in Trellis that can still be opened', async () => {
    expect(await chooseLaunch(base)).toEqual({ mode: 'resume', sessionId: 'last' })
  })

  it("falls back to the agent's own pick, then to a new conversation", async () => {
    const none = { ...base, conversations: async () => [view('gone', false)] }
    expect(await chooseLaunch(none)).toEqual({ mode: 'continue', sessionId: null })
    const fresh = await chooseLaunch({ ...none, hasPriorSession: async () => false })
    expect(fresh.mode).toBe('new')
    expect(fresh.sessionId).toMatch(/^[\w-]+$/)
  })

  it('starts a new conversation when another tab may hold the one to continue', async () => {
    expect((await chooseLaunch({ ...base, otherClaudeRunning: true })).mode).toBe('new')
    expect((await chooseLaunch({ ...base, mode: 'new' })).mode).toBe('new')
  })
})

describe('isSessionId', () => {
  it('accepts ids and nothing that could act as another argument', () => {
    expect(isSessionId('3f1c-aa_9')).toBe(true)
    expect(isSessionId('--dangerously-skip-permissions x')).toBe(false)
    expect(isSessionId('')).toBe(false)
    expect(isSessionId(7)).toBe(false)
  })
})
