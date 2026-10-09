import { describe, expect, it } from 'vitest'
import type { EventOf, HealthSnapshot } from '@shared/types'
import { comparisonBase, computeTrend, shouldRecord, toSnapshot } from './health-trend'

const DAY = 86_400_000
const snap = (ts: number, over: string[], violations = 0): EventOf<'health.snapshot'> => ({
  id: String(ts),
  ts,
  projectId: 'p',
  agent: 'trellis',
  sessionId: null,
  promptId: null,
  terminalId: null,
  kind: 'health.snapshot',
  data: toSnapshot({
    fileCount: 1,
    totalLines: 100,
    overThreshold: over.map((path) => ({ path, lines: 400 })),
    violations,
    newViolations: 0,
  }),
})

describe('health trend', () => {
  const now = 100 * DAY
  it('records about once a day', () => {
    expect(shouldRecord([], now)).toBe(true)
    expect(shouldRecord([snap(now - DAY / 2, [])], now)).toBe(false)
    expect(shouldRecord([snap(now - DAY, [])], now)).toBe(true)
  })

  it('compares with a week ago, or the oldest older than half a day', () => {
    const list = [snap(now - 10 * DAY, []), snap(now - 8 * DAY, ['a.ts']), snap(now - 2 * DAY, [])]
    expect(comparisonBase(list, now)?.ts).toBe(now - 8 * DAY)
    expect(comparisonBase([snap(now - 2 * DAY, [])], now)?.ts).toBe(now - 2 * DAY)
    expect(comparisonBase([snap(now - 1000, [])], now)).toBeNull()
  })

  it('lists files that newly went over the limit', () => {
    const current: HealthSnapshot = snap(now, ['a.ts', 'b.ts'], 5).data
    const trend = computeTrend(current, snap(now - 8 * DAY, ['a.ts'], 2))
    expect(trend.deltas).toEqual({ overThreshold: 1, violations: 3, totalLines: 0 })
    expect(trend.newlyOverThreshold.map((f) => f.path)).toEqual(['b.ts'])
    expect(computeTrend(current, null).since).toBeNull()
  })
})
