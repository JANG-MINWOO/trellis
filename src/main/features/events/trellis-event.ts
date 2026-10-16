import type { EventKind, EventOf } from '@shared/types'
import { newId } from '../../lib/ids'

/** Which session, turn and tab an event belongs to. */
export interface EventRef {
  sessionId: string | null
  promptId: string | null
  terminalId: string | null
}

const NO_REF: EventRef = { sessionId: null, promptId: null, terminalId: null }

/** An event Trellis records itself, as opposed to one the agent reported. */
export function trellisEvent<K extends EventKind>(
  projectId: string,
  kind: K,
  data: EventOf<K>['data'],
  ref: EventRef = NO_REF,
  ts = Date.now(),
): EventOf<K> {
  return {
    id: newId(),
    ts,
    projectId,
    agent: 'trellis',
    sessionId: ref.sessionId,
    promptId: ref.promptId,
    terminalId: ref.terminalId,
    kind,
    data,
  } as EventOf<K>
}
