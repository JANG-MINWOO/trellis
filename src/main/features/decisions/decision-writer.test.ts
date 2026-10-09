import { mkdtempSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { DecisionCandidate } from '@shared/types'
import { writeDecisionRecord } from './decision-writer'

const candidate: DecisionCandidate = {
  candidateId: 'c1',
  source: 'analysis',
  title: 'Use Redis for sessions',
  what: 'Sessions move from memory to Redis.',
  whyGuess: 'Survive restarts',
  alternatives: 'Database table',
  consequences: 'Logins survive deploys; one more service to run.',
  kind: 'architecture',
  risk: 'high',
  files: ['src/session.ts'],
}

describe('writeDecisionRecord', () => {
  it('writes the next numbered record and never overwrites', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'trellis-adr-'))
    mkdirSync(path.join(root, 'docs', 'decisions'), { recursive: true })
    writeFileSync(path.join(root, 'docs', 'decisions', '0007-old.md'), '# old\n')
    const rel = await writeDecisionRecord(
      root,
      'docs/decisions',
      candidate,
      { reason: '배포 때 로그인이 풀려서', reasonFromGuess: false },
      'ko',
    )
    expect(rel).toBe('docs/decisions/0008-use-redis-for-sessions.md')
    const text = readFileSync(path.join(root, ...rel!.split('/')), 'utf8')
    expect(text).toContain('배포 때 로그인이 풀려서')
    expect(text).toContain('Logins survive deploys')
    await writeDecisionRecord(
      root,
      'docs/decisions',
      candidate,
      { reason: 'again', reasonFromGuess: false },
      'en',
    )
    expect(readdirSync(path.join(root, 'docs', 'decisions')).sort()).toEqual([
      '0007-old.md',
      '0008-use-redis-for-sessions.md',
      '0009-use-redis-for-sessions.md',
    ])
  })

  it('writes nothing when the project keeps no records or the folder escapes it', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'trellis-adr-'))
    expect(
      await writeDecisionRecord(root, '', candidate, { reason: 'x', reasonFromGuess: false }, 'en'),
    ).toBeNull()
    expect(
      await writeDecisionRecord(
        root,
        '../outside',
        candidate,
        { reason: 'x', reasonFromGuess: false },
        'en',
      ),
    ).toBeNull()
  })
})
