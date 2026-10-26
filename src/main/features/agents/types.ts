import type { AgentId, ClaudeLaunchMode, PermissionMode, TrellisEvent } from '@shared/types'
import type { Platform } from '../../platform/os'

export interface LaunchRequest {
  mode: ClaudeLaunchMode
  permissionMode: PermissionMode
  /** Pre-assigned id for a new session, the conversation to resume; null for --continue. */
  sessionId: string | null
  extraArgs: string[]
  /** File produced by prepareBridge(). */
  bridgeConfigFile: string
}

export interface NormalizeContext {
  projectId: string
  projectRoot: string
  terminalId: string | null
  now: number
}

/** Everything agent-specific lives behind this interface (ADR-0009). v1 implements Claude Code. */
export interface AgentAdapter {
  readonly id: AgentId
  readonly executableName: string
  /** Whether "continue the last conversation" can work in this folder. */
  hasPriorSession(projectRoot: string, env: NodeJS.ProcessEnv): Promise<boolean>
  /** Whether the agent still has this conversation of the folder (so it can be resumed). */
  hasSession(projectRoot: string, sessionId: string, env: NodeJS.ProcessEnv): Promise<boolean>
  /** Recognizes the output of a continue or resume attempt that found nothing to open. */
  isNothingToContinue(output: string): boolean
  /** Writes the config that makes the agent report events to the bridge. Returns its path. */
  prepareBridge(dir: string, bridgeUrl: string): Promise<string>
  launchArgs(request: LaunchRequest): string[]
  /** Env vars the bridge config refers to. */
  bridgeEnv(token: string, projectId: string, terminalId: string): Record<string, string>
  normalize(raw: unknown, context: NormalizeContext): TrellisEvent | null
  /** Longest the bridge may hold a Stop reply; the end-of-turn check must fit inside it. */
  readonly stopReplyMs: number
  /** How long the bridge may hold the reply to this hook payload before answering empty. */
  replyTimeoutMs(raw: unknown): number
  /** The agent is stopping again after Trellis sent the turn back once; do not block twice. */
  isContinuedStop(raw: unknown): boolean
  /** Reply body that makes the agent keep working on `reason` instead of ending the turn. */
  blockStopReply(reason: string): Record<string, unknown>
  /**
   * Removes variables a parent agent session leaks into Trellis (e.g. when the dev build is started
   * from Claude Code). Left in place they make a new session think it is a sub-session.
   */
  scrubInheritedEnv(env: Record<string, string>): void
  /** Keystroke that makes the agent read an image from the system clipboard, if it has one. */
  imagePasteKeys(platform: Platform): string | null
  /**
   * Arguments for a one-shot, tool-less, isolated run that answers with JSON matching `schema`.
   * Isolation matters: the user's own hooks and MCP servers must not run for Trellis' analysis.
   */
  headlessArgs(options: { schema: object; model: string }): string[]
  /** Extracts the structured answer from a headless run's stdout. */
  parseHeadless(stdout: string): { ok: true; data: unknown } | { ok: false; message: string }
}
