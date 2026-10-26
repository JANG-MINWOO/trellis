import type { LaunchMode, PermissionMode } from './settings'

export type TerminalKind = 'claude' | 'shell'

export interface TerminalInfo {
  id: string
  projectId: string
  kind: TerminalKind
  title: string
  /** 1-based position among terminals of the same kind in the project ("Claude 2"). */
  index: number
  /** Permission mode the current process was started with (claude terminals only). */
  permissionMode: PermissionMode | null
  /** Claude session id when known (set for new sessions, learned from events otherwise). */
  sessionId: string | null
  startedAt: number
  running: boolean
  exitCode: number | null
}

/** How a Claude process starts: the settings' two modes, or a chosen conversation (ADR-0035). */
export type ClaudeLaunchMode = LaunchMode | 'resume'

export interface TerminalStartRequest {
  projectId: string
  kind: TerminalKind
  mode?: LaunchMode
  /** Open this conversation again (overrides `mode`). */
  sessionId?: string
  permissionMode?: PermissionMode
  /** Restart this terminal (same tab). */
  terminalId?: string
  /** Open an additional tab instead of reusing the project's first terminal of this kind. */
  newTab?: boolean
  cols: number
  rows: number
}

export type TerminalStartResult =
  | { ok: true; terminal: TerminalInfo }
  | {
      ok: false
      reason: 'agent-not-found' | 'project-missing' | 'spawn-failed' | 'session-in-use'
      message: string
    }

/** A conversation Trellis has seen in the project, to open again (ADR-0035). */
export interface ConversationSummary {
  sessionId: string
  startedAt: number
  lastAt: number
  turns: number
  /** Its latest task's goal, or else its first prompt (first line). */
  title: string
  /** Its latest task, if any: still in progress in this conversation, finished, or neither. */
  task: { taskId: string; state: 'open' | 'done' | 'ended' } | null
}

export interface ConversationView extends ConversationSummary {
  /** The agent still has the conversation, so it can be opened. */
  available: boolean
}
