// What happens around a turn: snapshot at the prompt, then at the end changes → (guard) →
// analysis. The Stop hook can be answered with "block" so the agent fixes problems first (M3).
import type { EventOf, Project, RulesCheck } from '@shared/types'
import { newId } from '../../lib/ids'
import { logFailure } from '../../lib/log'
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
  /** Structure rules and the project's check command (M3). */
  guard:
    | ((project: Project, changes: TurnChanges, mayBlock: boolean) => Promise<GuardVerdict | null>)
    | null
  /** Prepares the start-of-turn check while the agent works. */
  warm?: (project: Project, startTree: string) => void
  /** The end-of-turn check is running (the agent waits for it). */
  onCheck?: (projectId: string, running: boolean) => void
}

export class TurnPipeline {
  /** Turns the guard sent back; their final check is recorded even when it comes back clean. */
  private readonly sentBack = new Set<string>()

  constructor(private readonly deps: TurnPipelineDeps) {}

  /** Called before the prompt hook is answered, so the snapshot predates the agent's work. */
  async onPrompt(project: Project, promptId: string): Promise<void> {
    await this.deps.changes
      .beginTurn(project.id, project.path, promptId)
      .catch(logFailure('turns', 'turn start snapshot failed'))
    const tree = this.deps.changes.turnStartTree(project.id, promptId)
    if (tree && project.guard.enforceRules) this.deps.warm?.(project, tree)
  }

  /**
   * Returns the reason to send the agent back with when the turn should continue (the guard found
   * new violations), otherwise finishes the turn in the background so the agent is not kept
   * waiting. `continued`: the agent already went back once for this turn.
   */
  async onStop(
    project: Project,
    stop: EventOf<'turn.stop'>,
    continued: boolean,
  ): Promise<string | undefined> {
    const promptId = stop.promptId
    if (!promptId) return undefined
    if (project.guard.enforceRules && this.deps.guard && !continued) {
      const peek = await this.deps.changes.turnChanges(project.id, project.path, promptId, false)
      if (peek && peek.files.length > 0) {
        this.deps.onCheck?.(project.id, true)
        const verdict = await this.deps
          .guard(project, peek, true)
          .finally(() => this.deps.onCheck?.(project.id, false))
        if (verdict?.reason) {
          this.sentBack.add(`${project.id}:${promptId}`)
          await this.append(project, stop, 'rules.check', { ...verdict.check, blocked: true })
          return verdict.reason
        }
      }
    }
    void this.finish(project, stop).catch(logFailure('turns', 'finishing the turn failed'))
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
    const wasSentBack = this.sentBack.delete(`${project.id}:${stop.promptId}`)
    if (this.deps.guard) {
      const verdict = await this.deps
        .guard(project, changes, false)
        .catch(logFailure('turns', 'end-of-turn check failed'))
      if (
        verdict &&
        (verdict.check.newViolations.length > 0 || verdict.check.check || wasSentBack)
      ) {
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
