import { promises as fs, realpathSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getEnv } from '../../../platform/env'
import type { AgentAdapter, LaunchRequest } from '../types'
import { BRIDGE_ENV, buildHookSettings } from './hook-settings'
import { normalizeClaudeHook } from './normalize'

/** Flags that choose which conversation to open; if the user passes one we do not add ours. */
const SESSION_FLAGS = ['--continue', '-c', '--resume', '-r', '--session-id', '--fork-session']

export const claudeCodeAdapter: AgentAdapter = {
  id: 'claude-code',
  executableName: 'claude',

  // Claude Code keeps one folder per working directory under <config>/projects, named by replacing
  // every non-alphanumeric character with '-'. Internal layout: a wrong guess only means we start
  // a new conversation, and launch falls back if --continue finds nothing anyway.
  async hasPriorSession(projectRoot, env) {
    const configDir = getEnv(env, 'CLAUDE_CONFIG_DIR') || path.join(os.homedir(), '.claude')
    const roots = new Set([projectRoot])
    try {
      roots.add(realpathSync(projectRoot))
    } catch {
      // keep the given path only
    }
    for (const root of roots) {
      const dir = path.join(configDir, 'projects', root.replace(/[^a-zA-Z0-9]/g, '-'))
      try {
        if ((await fs.readdir(dir)).some((f) => f.endsWith('.jsonl'))) return true
      } catch {
        // no folder → no sessions
      }
    }
    return false
  },

  isNothingToContinue(output) {
    return /no conversation found to continue/i.test(output)
  },

  async prepareBridge(dir, bridgeUrl) {
    const file = path.join(dir, 'claude-settings.json')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(file, JSON.stringify(buildHookSettings(bridgeUrl), null, 2), 'utf8')
    return file
  },

  launchArgs(request: LaunchRequest) {
    const args = ['--settings', request.bridgeConfigFile]
    const userPicksSession = request.extraArgs.some((a) => SESSION_FLAGS.includes(a.split('=')[0]!))
    if (!userPicksSession) {
      if (request.mode === 'continue') args.push('--continue')
      else if (request.sessionId) args.push('--session-id', request.sessionId)
    }
    return [...args, ...request.extraArgs]
  },

  bridgeEnv(token, projectId, terminalId) {
    return {
      [BRIDGE_ENV.token]: token,
      [BRIDGE_ENV.project]: projectId,
      [BRIDGE_ENV.terminal]: terminalId,
    }
  },

  normalize: normalizeClaudeHook,
}
