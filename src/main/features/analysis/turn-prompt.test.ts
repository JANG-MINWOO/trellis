import { describe, expect, it } from 'vitest'
import type { ChangeEntry } from '@shared/types'
import { buildTurnPrompt, riskAreaCandidates, toCandidates } from './turn-prompt'

const file = (path: string): ChangeEntry => ({
  path,
  oldPath: null,
  status: 'M',
  additions: 3,
  deletions: 1,
  binary: false,
})
let n = 0
const id = (): string => `c${++n}`

describe('buildTurnPrompt', () => {
  it('includes the language, intent, files and existing items', () => {
    const prompt = buildTurnPrompt({
      projectName: 'shop',
      lang: 'ko',
      intent: '하면 안 되는 것: 결제 금액 계산 변경',
      prompt: '로그인 잠금 추가',
      lastMessage: 'done',
      files: [file('src/auth/lock.ts')],
      patch: '+ lock()',
      decisionTitles: ['Use bcrypt'],
      specItems: [{ id: 'B-001', kind: 'behavior', text: 'WHEN x, THE SYSTEM SHALL y.' }],
    })
    expect(prompt).toContain('Write every text field in Korean')
    expect(prompt).toContain('M src/auth/lock.ts (+3 −1)')
    expect(prompt).toContain('- [B-001] WHEN x')
    expect(prompt).toContain('결제 금액 계산 변경')
    expect(prompt).toContain('NOT decisions')
  })
})

describe('toCandidates', () => {
  const ctx = {
    files: [file('src/a.ts'), file('src/b.ts')],
    decisionTitles: ['Use bcrypt'],
    specItems: [{ id: 'B-001', kind: 'behavior' as const, text: 'x' }],
  }

  it('keeps valid items, drops repeats and unknown files, caps the count', () => {
    const out = toCandidates(
      {
        decisions: [
          {
            title: 'Use bcrypt',
            what: 'repeat',
            whyGuess: '',
            alternatives: '',
            consequences: '',
            kind: 'security',
            risk: 'high',
            files: [],
          },
          {
            title: 'Add Redis cache',
            what: 'w',
            whyGuess: 'g',
            alternatives: 'a',
            consequences: 'c',
            kind: 'weird',
            risk: 'huge',
            files: ['src/a.ts', 'nope.ts'],
          },
          {
            title: 'T3',
            what: '',
            whyGuess: '',
            alternatives: '',
            consequences: '',
            kind: 'data',
            risk: 'low',
            files: [],
          },
          {
            title: 'T4',
            what: '',
            whyGuess: '',
            alternatives: '',
            consequences: '',
            kind: 'data',
            risk: 'low',
            files: [],
          },
          {
            title: 'T5',
            what: '',
            whyGuess: '',
            alternatives: '',
            consequences: '',
            kind: 'data',
            risk: 'low',
            files: [],
          },
        ],
        behaviors: [
          {
            op: 'change',
            kind: 'behavior',
            area: 'Login',
            targetId: 'B-001',
            statement: 'WHEN a, THE SYSTEM SHALL b.',
            files: ['src/b.ts'],
          },
          {
            op: 'change',
            kind: 'behavior',
            area: 'Login',
            targetId: 'B-999',
            statement: 'WHEN c, THE SYSTEM SHALL d.',
            files: [],
          },
          {
            op: 'remove',
            kind: 'behavior',
            area: 'Login',
            targetId: 'B-404',
            statement: '',
            files: [],
          },
        ],
      },
      ctx,
      id,
    )
    expect(out.decisions.map((d) => d.title)).toEqual(['Add Redis cache', 'T3', 'T4'])
    expect(out.decisions[0]).toMatchObject({ kind: 'other', risk: 'medium', files: ['src/a.ts'] })
    expect(out.behaviors.map((b) => [b.op, b.targetId])).toEqual([
      ['change', 'B-001'],
      ['add', null],
    ])
  })

  it('tolerates garbage', () => {
    expect(toCandidates('nope', ctx, id)).toEqual({ decisions: [], behaviors: [] })
  })
})

describe('riskAreaCandidates', () => {
  it('groups uncovered risk files by glob', () => {
    const cards = riskAreaCandidates(
      [
        file('src/auth/a.ts'),
        file('src/auth/b.ts'),
        file('db/migrations/1.sql'),
        file('src/ui.ts'),
      ],
      ['**/auth/**', '**/migrations/**'],
      new Set(['src/auth/b.ts']),
      'en',
      id,
    )
    expect(cards.map((c) => [c.title, c.files])).toEqual([
      ['A risk area changed: **/auth/**', ['src/auth/a.ts']],
      ['A risk area changed: **/migrations/**', ['db/migrations/1.sql']],
    ])
    expect(cards[0]?.source).toBe('risk-area')
  })
})
