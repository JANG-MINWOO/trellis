// Maps Claude Code hook payloads (verified against 2.1.294) to agent-agnostic TrellisEvents.
// Field names Claude Code owns appear only in this file.
import { realpathSync } from 'node:fs'
import type { ToolUse, TrellisEvent } from '@shared/types'
import { newId } from '../../../lib/ids'
import { toProjectRelative } from '../../../platform/paths'
import type { NormalizeContext } from '../types'

const LIMITS = { prompt: 4000, command: 1000, message: 2000, error: 1000, detail: 300, notice: 500 }
const FILE_WRITING_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
/** Notifications that mean Claude is waiting for the human. */
const ASKS_FOR_INPUT = new Set(['permission_prompt', 'elicitation_dialog', 'agent_needs_input'])

type Raw = Record<string, unknown>

const obj = (v: unknown): Raw => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {})
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const truncate = (s: string, max: number): string =>
  s.length > max ? `${s.slice(0, max - 1)}…` : s

const realRoots = new Map<string, string>()
function realRoot(root: string): string {
  let real = realRoots.get(root)
  if (!real) {
    try {
      real = realpathSync(root)
    } catch {
      real = root
    }
    realRoots.set(root, real)
  }
  return real
}

function relativeFile(root: string, file: string): string | null {
  if (!file) return null
  return toProjectRelative(root, file) ?? toProjectRelative(realRoot(root), file)
}

export function describeTool(raw: Raw, root: string): ToolUse {
  const tool = str(raw.tool_name) || 'unknown'
  const input = obj(raw.tool_input)
  const durationMs = typeof raw.duration_ms === 'number' ? raw.duration_ms : null
  const filePath = str(input.file_path) || str(input.notebook_path)
  const rel = relativeFile(root, filePath)
  let files: string[] = []
  let command: string | null = null
  let detail: string | null = null

  if (FILE_WRITING_TOOLS.has(tool)) {
    if (rel !== null && rel !== '') files = [rel]
    else detail = filePath || null
  } else if (tool === 'Bash' || tool === 'PowerShell') {
    command = truncate(str(input.command), LIMITS.command) || null
    detail = str(input.description) || null
  } else if (tool === 'Read') {
    detail = rel ?? (filePath || null)
  } else {
    detail =
      str(input.pattern) ||
      str(input.url) ||
      str(input.query) ||
      str(input.description) ||
      str(input.subagent_type) ||
      null
  }
  return {
    tool,
    files,
    command,
    detail: detail ? truncate(detail, LIMITS.detail) : null,
    durationMs,
  }
}

export function normalizeClaudeHook(rawInput: unknown, ctx: NormalizeContext): TrellisEvent | null {
  const raw = obj(rawInput)
  const base = {
    id: newId(),
    ts: ctx.now,
    projectId: ctx.projectId,
    agent: 'claude-code' as const,
    sessionId: str(raw.session_id) || null,
    promptId: str(raw.prompt_id) || null,
    terminalId: ctx.terminalId,
  }
  switch (str(raw.hook_event_name)) {
    case 'SessionStart':
      return {
        ...base,
        kind: 'session.start',
        data: { source: str(raw.source) || 'startup', model: str(raw.model) || null },
      }
    case 'SessionEnd':
      return { ...base, kind: 'session.end', data: { reason: str(raw.reason) || 'other' } }
    case 'UserPromptSubmit':
      return {
        ...base,
        kind: 'prompt.submit',
        data: { prompt: truncate(str(raw.prompt), LIMITS.prompt) },
      }
    case 'PostToolUse':
      return { ...base, kind: 'tool.use', data: describeTool(raw, ctx.projectRoot) }
    case 'PostToolUseFailure':
      return {
        ...base,
        kind: 'tool.fail',
        data: {
          ...describeTool(raw, ctx.projectRoot),
          error: truncate(str(raw.error), LIMITS.error),
        },
      }
    case 'Stop':
      return {
        ...base,
        kind: 'turn.stop',
        data: { lastMessage: truncate(str(raw.last_assistant_message), LIMITS.message) },
      }
    case 'Notification': {
      const type = str(raw.notification_type) || 'unknown'
      return {
        ...base,
        kind: 'notification',
        data: {
          type,
          message: truncate(str(raw.message), LIMITS.notice),
          needsInput: ASKS_FOR_INPUT.has(type),
        },
      }
    }
    default:
      return null
  }
}
