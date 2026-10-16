// The Health panel (M1 metrics + M3 rules and trend + M4 document drift) for one project.
import type { EventOf, HealthReport, Project } from '@shared/types'
import { trellisEvent, type EventStore } from '../events'
import type { RulesService } from '../rules'
import { comparisonBase, computeTrend, shouldRecord, toSnapshot } from './health-trend'

export class HealthService {
  /** Daily snapshots per project, read from the ledger once and kept up to date here. */
  private readonly snapshots = new Map<string, EventOf<'health.snapshot'>[]>()

  constructor(
    private readonly rules: RulesService,
    private readonly events: EventStore,
  ) {}

  async get(project: Project): Promise<HealthReport> {
    const result = await this.rules.current(project)
    const rules = this.rules.report(result)
    const { analysis } = result
    const now = Date.now()
    const snapshot = toSnapshot({
      fileCount: analysis.metrics.fileCount,
      totalLines: analysis.metrics.totalLines,
      overThreshold: analysis.overThreshold,
      violations: analysis.violations.length,
      newViolations: rules.newViolations.length,
    })
    const snapshots = await this.snapshotsOf(project.id)
    const trend = computeTrend(snapshot, comparisonBase(snapshots, now))
    if (shouldRecord(snapshots, now)) {
      const event = trellisEvent(project.id, 'health.snapshot', snapshot, undefined, now)
      await this.events.append(event)
      snapshots.push(event)
    }
    return { computedAt: now, ...analysis.metrics, rules, drift: analysis.drift, trend }
  }

  private async snapshotsOf(projectId: string): Promise<EventOf<'health.snapshot'>[]> {
    let list = this.snapshots.get(projectId)
    if (!list) {
      list = (await this.events.list(projectId, 1_000_000)).filter(
        (e): e is EventOf<'health.snapshot'> => e.kind === 'health.snapshot',
      )
      this.snapshots.set(projectId, list)
    }
    return list
  }
}
