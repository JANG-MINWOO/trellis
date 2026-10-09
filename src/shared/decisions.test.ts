import { describe, expect, it } from 'vitest'
import { nextRecordName, pendingDecisions, renderDecisionRecord, slugify } from './decisions'
import type { DecisionCandidate, TrellisEvent } from './types'

const candidate = (id: string): DecisionCandidate => ({
  candidateId: id,
  source: 'analysis',
  title: 'Use bcrypt for passwords',
  what: 'Hash passwords with bcrypt instead of SHA-256.',
  whyGuess: 'Slow hashes resist brute force.',
  alternatives: 'argon2, scrypt',
  consequences: 'Logins take ~100ms longer; old hashes need migration.',
  kind: 'security',
  risk: 'high',
  files: ['src/auth/hash.ts'],
})

const base = {
  projectId: 'p',
  agent: 'trellis' as const,
  sessionId: null,
  promptId: 'pr',
  terminalId: 't',
}

describe('pendingDecisions', () => {
  it('lists candidates without a resolution, newest first', () => {
    const events: TrellisEvent[] = [
      { ...base, id: '1', ts: 1, kind: 'decision.candidate', data: candidate('a') },
      { ...base, id: '2', ts: 2, kind: 'decision.candidate', data: candidate('b') },
      {
        ...base,
        id: '3',
        ts: 3,
        kind: 'decision.resolved',
        data: {
          candidateId: 'a',
          resolution: 'dismissed',
          reason: '',
          reasonFromGuess: false,
          docPath: null,
        },
      },
    ]
    expect(pendingDecisions(events).map((d) => d.candidateId)).toEqual(['b'])
  })
})

describe('record naming', () => {
  it('slugifies titles, keeping Korean', () => {
    expect(slugify('Use bcrypt for passwords!')).toBe('use-bcrypt-for-passwords')
    expect(slugify('세션 대신 JWT 쓰기')).toBe('세션-대신-jwt-쓰기')
    expect(slugify('***')).toBe('decision')
  })

  it('numbers after the highest existing record', () => {
    expect(nextRecordName(['README.md', '0001-a.md', '0014-b.md'], 'New one')).toEqual({
      number: 15,
      file: '0015-new-one.md',
    })
    expect(nextRecordName([], 'First').file).toBe('0001-first.md')
  })
})

describe('renderDecisionRecord', () => {
  it('writes the human reason and marks a confirmed guess', () => {
    const text = renderDecisionRecord(
      15,
      candidate('a'),
      { reason: 'Required by the security review.', reasonFromGuess: false },
      'en',
      new Date('2026-10-10T00:00:00Z'),
    )
    expect(text).toContain('# ADR-0015: Use bcrypt for passwords')
    expect(text).toContain('Required by the security review.')
    expect(text).toContain('- `src/auth/hash.ts`')
    const guessed = renderDecisionRecord(
      1,
      candidate('a'),
      { reason: 'Slow hashes resist brute force.', reasonFromGuess: true },
      'ko',
      new Date(),
    )
    expect(guessed).toContain('AI가 짐작한 이유를 사람이 그대로 확인함')
    expect(guessed).toContain('## 결과와 대가')
  })
})
