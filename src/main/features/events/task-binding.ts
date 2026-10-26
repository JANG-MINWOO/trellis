// A task written while its tab's conversation was unknown (no Claude tab yet, or just after
// `/clear`) belongs to the conversation of that tab's next prompt (ADR-0035). The tie goes into the
// ledger, so it does not depend on how far back anyone reads the events.
import { deriveTasks, waitingTaskFor } from '@shared/tasks'
import type { EventOf } from '@shared/types'
import type { EventStore } from './event-store'
import { trellisEvent } from './trellis-event'

export async function bindWaitingTask(
  events: EventStore,
  prompt: EventOf<'prompt.submit'>,
): Promise<void> {
  if (!prompt.sessionId) return
  const task = waitingTaskFor(deriveTasks(await events.list(prompt.projectId)), prompt.terminalId)
  if (!task?.waiting) return
  await events.append(
    trellisEvent(
      prompt.projectId,
      'intent.continue',
      { taskId: task.taskId, from: task.waiting.from },
      { sessionId: prompt.sessionId, promptId: null, terminalId: prompt.terminalId },
    ),
  )
}
