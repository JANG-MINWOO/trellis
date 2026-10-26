// Agent hook payload → normalized event → ledger and turn pipeline (ADR-0003, ADR-0027).
import type { Project, TrellisEvent } from '@shared/types'
import type { AgentAdapter } from '../agents'
import { logFailure } from '../../lib/log'
import type { BridgeHandler } from '../bridge'
import { bindWaitingTask, type EventStore } from '../events'
import type { ProjectRegistry } from '../projects'
import type { TurnPipeline } from './turn-pipeline'

export interface HookIngestDeps {
  registry: ProjectRegistry
  adapter: AgentAdapter
  events: EventStore
  pipeline: TurnPipeline
  /** Every agent event proves the tab's session is alive and tells its session id. */
  onAgentEvent: (terminalId: string | null, event: TrellisEvent) => void
  /** A finished turn or a question for the human (shown when Trellis is in the background). */
  notify: (event: TrellisEvent, project: Project) => void
}

export function createHookIngest(deps: HookIngestDeps): BridgeHandler {
  const { registry, adapter, events, pipeline } = deps
  return async ({ raw, projectId, terminalId, receivedAt }) => {
    const project = registry.get(projectId)
    if (!project) return undefined
    const event = adapter.normalize(raw, {
      projectId,
      projectRoot: project.path,
      terminalId,
      now: receivedAt,
    })
    if (!event) return undefined
    deps.onAgentEvent(terminalId, event)
    // Before the prompt hook is answered (the agent waits for it), so the snapshot predates the turn.
    if (event.kind === 'prompt.submit' && event.promptId)
      await pipeline.onPrompt(project, event.promptId)
    await events.append(event)
    // Off the prompt's reply path: the agent waits for it.
    if (event.kind === 'prompt.submit')
      void bindWaitingTask(events, event).catch(logFailure('intent', 'tying a task failed'))
    if (event.kind === 'turn.stop') {
      const reason = await pipeline.onStop(project, event, adapter.isContinuedStop(raw))
      // A turn sent back by the guard is not finished; say so only when it really is.
      if (reason) return adapter.blockStopReply(reason)
    }
    deps.notify(event, project)
    return undefined
  }
}
