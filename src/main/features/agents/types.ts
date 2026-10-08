import type { AgentId, LaunchMode, TrellisEvent } from '@shared/types'

export interface LaunchRequest {
  mode: LaunchMode
  /** Pre-assigned id for a new session; null when continuing. */
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
  /** Recognizes the output of a continue attempt that found nothing to continue. */
  isNothingToContinue(output: string): boolean
  /** Writes the config that makes the agent report events to the bridge. Returns its path. */
  prepareBridge(dir: string, bridgeUrl: string): Promise<string>
  launchArgs(request: LaunchRequest): string[]
  /** Env vars the bridge config refers to. */
  bridgeEnv(token: string, projectId: string, terminalId: string): Record<string, string>
  normalize(raw: unknown, context: NormalizeContext): TrellisEvent | null
}
