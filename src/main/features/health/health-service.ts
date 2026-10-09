// The Health panel (M1 metrics + M3 rules and trend + M4 document drift) for one project.
import type { EventOf, HealthReport, Project } from '@shared/types'
import { newId } from '../../lib/ids'
import type { EventStore } from '../events'
import type { RulesService } from '../rules'
import { comparisonBase, computeTrend, shouldRecord, toSnapshot } from './health-trend'

export class HealthService {
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
    const snapshots = (await this.events.list(project.id, 50_000)).filter(
      (e): e is EventOf<'health.snapshot'> => e.kind === 'health.snapshot',
    )
    const trend = computeTrend(snapshot, comparisonBase(snapshots, now))
    if (shouldRecord(snapshots, now)) {
      await this.events.append({
        id: newId(),
        ts: now,
        projectId: project.id,
        agent: 'trellis',
        sessionId: null,
        promptId: null,
        terminalId: null,
        kind: 'health.snapshot',
        data: snapshot,
      })
    }
    return { computedAt: now, ...analysis.metrics, rules, drift: analysis.drift, trend }
  }
}
