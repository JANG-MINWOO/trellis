import { promises as fs, realpathSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getEnv } from '../../../platform/env'
import type { PermissionMode } from '@shared/types'
import type { AgentAdapter, LaunchRequest } from '../types'
import { BRIDGE_ENV, buildHookSettings, STOP_HOOK_TIMEOUT_S } from './hook-settings'
import { normalizeClaudeHook } from './normalize'

/**
 * Variables Claude Code sets for the processes it spawns (observed in 2.1.29x). User configuration
 * such as CLAUDE_CONFIG_DIR or CLAUDE_CODE_USE_BEDROCK is deliberately not matched.
 */
const SESSION_MARKERS = new Set([
  'CLAUDECODE',
  'AI_AGENT',
  'CLAUDE_PID',
  'CLAUDE_EFFORT',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_EXECPATH',
  'CLAUDE_CODE_SSE_PORT',
])
const SESSION_MARKER_PREFIXES = [
  'CLAUDE_CODE_SESSION_',
  'CLAUDE_CODE_CHILD_',
  'CLAUDE_CODE_MESSAGING_',
]

/** Flags that choose which conversation to open; if the user passes one we do not add ours. */
const SESSION_FLAGS = ['--continue', '-c', '--resume', '-r', '--session-id', '--fork-session']
/** Same for permissions. */
const PERMISSION_FLAGS = [
  '--permission-mode',
  '--dangerously-skip-permissions',
  '--allow-dangerously-skip-permissions',
]

/** Where Claude Code may keep the conversations of a project folder (the path as given and real). */
function sessionDirs(projectRoot: string, env: NodeJS.ProcessEnv): string[] {
  const configDir = getEnv(env, 'CLAUDE_CONFIG_DIR') || path.join(os.homedir(), '.claude')
  const roots = new Set([projectRoot])
  try {
    roots.add(realpathSync(projectRoot))
  } catch {
    // keep the given path only
  }
  return [...roots].map((root) =>
    path.join(configDir, 'projects', root.replace(/[^a-zA-Z0-9]/g, '-')),
  )
}

/** Answer before Claude gives up on the hook (it would then end the turn without our reply). */
const STOP_REPLY_MS = (STOP_HOOK_TIMEOUT_S - 5) * 1000
/** Other hooks only need the work done for them to start (e.g. the turn's snapshot). */
const ACK_REPLY_MS = 1500

const hookEvent = (raw: unknown): string =>
  raw && typeof raw === 'object'
    ? String((raw as Record<string, unknown>).hook_event_name ?? '')
    : ''

function permissionArgs(mode: PermissionMode): string[] {
  if (mode === 'claude-default') return []
  if (mode === 'bypass') return ['--dangerously-skip-permissions']
  return ['--permission-mode', mode]
}

export const claudeCodeAdapter: AgentAdapter = {
  id: 'claude-code',
  executableName: 'claude',

  // Claude Code keeps one folder per working directory under <config>/projects, named by replacing
  // every non-alphanumeric character with '-', and one <session id>.jsonl per conversation in it.
  // Internal layout: a wrong guess only means we start a new conversation (launch also falls back
  // if --continue finds nothing), or a conversation shows as not openable.
  async hasPriorSession(projectRoot, env) {
    for (const dir of sessionDirs(projectRoot, env)) {
      try {
        if ((await fs.readdir(dir)).some((f) => f.endsWith('.jsonl'))) return true
      } catch {
        // no folder → no sessions
      }
    }
    return false
  },

  async hasSession(projectRoot, sessionId, env) {
    for (const dir of sessionDirs(projectRoot, env)) {
      try {
        await fs.access(path.join(dir, `${sessionId}.jsonl`))
        return true
      } catch {
        // not in this folder
      }
    }
    return false
  },

  isNothingToContinue(output) {
    // "No conversation found to continue" (--continue) or "… with session ID: …" (--resume).
    return /no conversation found/i.test(output)
  },

  async prepareBridge(dir, bridgeUrl) {
    const file = path.join(dir, 'claude-settings.json')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(file, JSON.stringify(buildHookSettings(bridgeUrl), null, 2), 'utf8')
    return file
  },

  launchArgs(request: LaunchRequest) {
    const args = ['--settings', request.bridgeConfigFile]
    const userSets = (flags: string[]): boolean =>
      request.extraArgs.some((a) => flags.includes(a.split('=')[0]!))
    if (!userSets(SESSION_FLAGS)) {
      if (request.mode === 'continue') args.push('--continue')
      else if (request.mode === 'resume' && request.sessionId)
        args.push('--resume', request.sessionId)
      else if (request.sessionId) args.push('--session-id', request.sessionId)
    }
    if (!userSets(PERMISSION_FLAGS)) args.push(...permissionArgs(request.permissionMode))
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

  stopReplyMs: STOP_REPLY_MS,

  replyTimeoutMs(raw) {
    return hookEvent(raw) === 'Stop' ? STOP_REPLY_MS : ACK_REPLY_MS
  },

  isContinuedStop(raw) {
    return hookEvent(raw) === 'Stop' && (raw as Record<string, unknown>).stop_hook_active === true
  },

  blockStopReply(reason) {
    return { decision: 'block', reason }
  },

  // --restricted ignores user/project/local settings (their hooks would otherwise fire for our
  // analysis prompt) while keeping the subscription login; --bare would drop OAuth entirely.
  headlessArgs({ schema, model }) {
    return [
      '-p',
      '--restricted',
      '--strict-mcp-config',
      '--tools',
      '',
      '--no-session-persistence',
      '--output-format',
      'json',
      '--json-schema',
      JSON.stringify(schema),
      '--model',
      model,
    ]
  },

  parseHeadless(stdout) {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(stdout) as Record<string, unknown>
    } catch {
      return { ok: false, message: stdout.trim().slice(0, 300) || 'empty output' }
    }
    if (parsed.is_error || parsed.subtype !== 'success') {
      return {
        ok: false,
        message: String(parsed.result ?? parsed.subtype ?? 'error').slice(0, 300),
      }
    }
    if (parsed.structured_output && typeof parsed.structured_output === 'object') {
      return { ok: true, data: parsed.structured_output }
    }
    try {
      return { ok: true, data: JSON.parse(String(parsed.result)) }
    } catch {
      return { ok: false, message: 'no structured output' }
    }
  },

  // Documented shortcuts: Ctrl+V on macOS/Linux, Alt+V on Windows (Esc-prefixed in a terminal).
  imagePasteKeys(platform) {
    return platform === 'win32' ? '\x1bv' : '\x16'
  },

  scrubInheritedEnv(env) {
    for (const key of Object.keys(env)) {
      const upper = key.toUpperCase()
      if (SESSION_MARKERS.has(upper) || SESSION_MARKER_PREFIXES.some((p) => upper.startsWith(p)))
        delete env[key]
    }
  },
}
