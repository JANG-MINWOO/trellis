// What happens around a turn: snapshot at the prompt, then at the end changes → (guard) →
// analysis. The Stop hook can be answered with "block" so the agent fixes problems first (M3).
import type { EventOf, Project, RulesCheck } from '@shared/types'
import { newId } from '../../lib/ids'
import type { TurnAnalyzer } from '../analysis'
import type { ChangesService, TurnChanges } from '../changes'
import type { EventStore } from '../events'

export interface GuardVerdict {
  check: RulesCheck
  /** Text sent back to the agent when the turn is blocked. */
  reason: string | null
}

export interface TurnPipelineDeps {
  events: EventStore
  changes: ChangesService
  analyzer: TurnAnalyzer
  /** Structure rules and the project's check command (M3). Null until available. */
  guard:
    | ((project: Project, changes: TurnChanges, mayBlock: boolean) => Promise<GuardVerdict | null>)
    | null
}

export class TurnPipeline {
  constructor(private readonly deps: TurnPipelineDeps) {}

  /** Called before the prompt hook is answered, so the snapshot predates the agent's work. */
  onPrompt(project: Project, promptId: string): Promise<void> {
    return this.deps.changes.beginTurn(project.id, project.path, promptId).catch(() => undefined)
  }

  /**
   * Returns a hook response body when the turn should continue (guard found new violations),
   * otherwise finishes the turn in the background so the agent is not kept waiting.
   */
  async onStop(
    project: Project,
    stop: EventOf<'turn.stop'>,
    stopHookActive: boolean,
  ): Promise<Record<string, unknown> | undefined> {
    const promptId = stop.promptId
    if (!promptId) return undefined
    if (project.guard.enforceRules && this.deps.guard && !stopHookActive) {
      const peek = await this.deps.changes.turnChanges(project.id, project.path, promptId, false)
      if (peek && peek.files.length > 0) {
        const verdict = await this.deps.guard(project, peek, true)
        if (verdict?.reason) {
          await this.append(project, stop, 'rules.check', { ...verdict.check, blocked: true })
          return { decision: 'block', reason: verdict.reason }
        }
      }
    }
    void this.finish(project, stop).catch(() => undefined)
    return undefined
  }

  private async finish(project: Project, stop: EventOf<'turn.stop'>): Promise<void> {
    const changes = await this.deps.changes.turnChanges(
      project.id,
      project.path,
      stop.promptId!,
      true,
    )
    if (!changes) return
    await this.append(project, stop, 'turn.changes', {
      files: changes.files,
      truncated: changes.truncated,
    })
    if (changes.files.length === 0) return
    if (this.deps.guard) {
      const verdict = await this.deps.guard(project, changes, false).catch(() => null)
      if (verdict && (verdict.check.newViolations.length > 0 || verdict.check.check)) {
        await this.append(project, stop, 'rules.check', verdict.check)
      }
    }
    await this.deps.analyzer.analyze(
      project,
      { promptId: stop.promptId!, sessionId: stop.sessionId, terminalId: stop.terminalId },
      changes,
    )
  }

  private append<K extends 'turn.changes' | 'rules.check'>(
    project: Project,
    stop: EventOf<'turn.stop'>,
    kind: K,
    data: EventOf<K>['data'],
  ): Promise<void> {
    return this.deps.events.append({
      id: newId(),
      ts: Date.now(),
      projectId: project.id,
      agent: 'trellis',
      sessionId: stop.sessionId,
      promptId: stop.promptId,
      terminalId: stop.terminalId,
      kind,
      data,
    } as EventOf<K>)
  }
}
