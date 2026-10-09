// "Worse than last week" (M3): one health snapshot per day in the ledger — an observation, not a
// derived copy — and a comparison with the snapshot from about a week ago.
import type { EventOf, HealthSnapshot, HealthTrend } from '@shared/types'

const DAY = 24 * 60 * 60 * 1000
const MAX_LISTED = 300

export function toSnapshot(input: {
  fileCount: number
  totalLines: number
  overThreshold: { path: string; lines: number }[]
  violations: number
  newViolations: number
}): HealthSnapshot {
  return {
    fileCount: input.fileCount,
    totalLines: input.totalLines,
    overThresholdCount: input.overThreshold.length,
    overThreshold: input.overThreshold.slice(0, MAX_LISTED),
    violations: input.violations,
    newViolations: input.newViolations,
  }
}

/** A new snapshot is worth keeping once per ~day. */
export function shouldRecord(
  snapshots: readonly EventOf<'health.snapshot'>[],
  now: number,
): boolean {
  const last = snapshots[snapshots.length - 1]
  return !last || now - last.ts >= 20 * 60 * 60 * 1000
}

/** The snapshot to compare with: the newest one at least a week old, else the oldest older than half a day. */
export function comparisonBase(
  snapshots: readonly EventOf<'health.snapshot'>[],
  now: number,
): EventOf<'health.snapshot'> | null {
  const weekOld = snapshots.filter((s) => s.ts <= now - 7 * DAY)
  if (weekOld.length > 0) return weekOld[weekOld.length - 1]!
  const first = snapshots[0]
  return first && first.ts <= now - DAY / 2 ? first : null
}

export function computeTrend(
  current: HealthSnapshot,
  base: EventOf<'health.snapshot'> | null,
): HealthTrend {
  if (!base)
    return {
      since: null,
      deltas: { overThreshold: 0, violations: 0, totalLines: 0 },
      newlyOverThreshold: [],
    }
  const before = new Set(base.data.overThreshold.map((f) => f.path))
  return {
    since: base.ts,
    deltas: {
      overThreshold: current.overThresholdCount - base.data.overThresholdCount,
      violations: current.violations - base.data.violations,
      totalLines: current.totalLines - base.data.totalLines,
    },
    newlyOverThreshold: current.overThreshold.filter((f) => !before.has(f.path)).slice(0, 10),
  }
}
