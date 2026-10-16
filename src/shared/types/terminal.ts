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

export interface TerminalStartRequest {
  projectId: string
  kind: TerminalKind
  mode?: LaunchMode
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
