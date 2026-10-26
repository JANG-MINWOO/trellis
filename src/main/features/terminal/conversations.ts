// Conversations to open again (ADR-0035): the ones Trellis saw in the project's ledger, marked by
// whether the agent still keeps them.
import { summarizeConversations } from '@shared/conversations'
import type { ClaudeLaunchMode, ConversationView, LaunchMode, TrellisEvent } from '@shared/types'
import { newId } from '../../lib/ids'
import type { AgentAdapter } from '../agents'

/** The list shows this many; older conversations stay reachable through the agent's own picker. */
const LIST_MAX = 30

export async function listConversations(
  adapter: AgentAdapter,
  events: readonly TrellisEvent[],
  projectRoot: string,
  env: NodeJS.ProcessEnv,
): Promise<ConversationView[]> {
  const list = summarizeConversations(events).slice(0, LIST_MAX)
  return Promise.all(
    list.map(async (c) => ({
      ...c,
      available: await adapter.hasSession(projectRoot, c.sessionId, env),
    })),
  )
}

/** Session ids go to the agent's argv; anything but an id-like string is refused. */
export const isSessionId = (v: unknown): v is string =>
  typeof v === 'string' && /^[\w-]{1,64}$/.test(v)

/**
 * What a Claude start opens: the conversation the human chose; for "continue" the one last used
 * in Trellis (or else the agent's most recent one); a new conversation with an id we know.
 * Another tab may be using the conversation "continue" would pick, so that starts a new one.
 */
export async function chooseLaunch(options: {
  chosen: string | null
  mode: LaunchMode
  otherClaudeRunning: boolean
  conversations: () => Promise<ConversationView[]>
  hasPriorSession: () => Promise<boolean>
}): Promise<{ mode: ClaudeLaunchMode; sessionId: string | null }> {
  if (options.chosen) return { mode: 'resume', sessionId: options.chosen }
  if (options.mode === 'continue' && !options.otherClaudeRunning) {
    const last = (await options.conversations()).find((c) => c.available)
    if (last) return { mode: 'resume', sessionId: last.sessionId }
    if (await options.hasPriorSession()) return { mode: 'continue', sessionId: null }
  }
  return { mode: 'new', sessionId: newId() }
}
