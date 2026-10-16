import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeClaudeHook } from './normalize'

const root = path.resolve('/tmp/trellis-project')
const ctx = { projectId: 'p1', projectRoot: root, terminalId: 't1', now: 1000 }

describe('normalizeClaudeHook', () => {
  it('maps a prompt with its ids', () => {
    const e = normalizeClaudeHook(
      { hook_event_name: 'UserPromptSubmit', session_id: 's1', prompt_id: 'pr1', prompt: 'hello' },
      ctx,
    )
    expect(e).toMatchObject({
      kind: 'prompt.submit',
      sessionId: 's1',
      promptId: 'pr1',
      terminalId: 't1',
      ts: 1000,
      data: { prompt: 'hello' },
    })
  })

  it('records files written by edit tools relative to the project', () => {
    const e = normalizeClaudeHook(
      {
        hook_event_name: 'PostToolUse',
        tool_name: 'Write',
        tool_input: { file_path: path.join(root, 'src', 'a.ts'), content: 'x'.repeat(10_000) },
        tool_response: { type: 'create' },
        duration_ms: 12,
      },
      ctx,
    )
    expect(e?.kind).toBe('tool.use')
    if (e?.kind !== 'tool.use') return
    expect(e.data.files).toEqual(['src/a.ts'])
    expect(e.data.durationMs).toBe(12)
    expect(JSON.stringify(e).length).toBeLessThan(1000)
  })

  it('keeps Bash commands but no files, and files outside the project as detail', () => {
    const bash = normalizeClaudeHook(
      {
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'npm test', description: 'run tests' },
      },
      ctx,
    )
    expect(bash).toMatchObject({ data: { files: [], command: 'npm test', detail: 'run tests' } })
    const outside = normalizeClaudeHook(
      {
        hook_event_name: 'PostToolUse',
        tool_name: 'Edit',
        tool_input: { file_path: '/etc/hosts' },
      },
      ctx,
    )
    expect(outside).toMatchObject({ data: { files: [], detail: '/etc/hosts' } })
  })

  it('maps stop, failure, notification and session edges', () => {
    expect(
      normalizeClaudeHook({ hook_event_name: 'Stop', last_assistant_message: 'done' }, ctx),
    ).toMatchObject({
      kind: 'turn.stop',
      data: { lastMessage: 'done' },
    })
    expect(
      normalizeClaudeHook(
        {
          hook_event_name: 'PostToolUseFailure',
          tool_name: 'Bash',
          tool_input: { command: 'x' },
          error: 'boom',
        },
        ctx,
      ),
    ).toMatchObject({ kind: 'tool.fail', data: { error: 'boom', command: 'x' } })
    expect(
      normalizeClaudeHook(
        { hook_event_name: 'Notification', notification_type: 'permission_prompt', message: 'ok?' },
        ctx,
      ),
    ).toMatchObject({
      kind: 'notification',
      data: { type: 'permission_prompt', needsInput: true },
    })
    expect(
      normalizeClaudeHook({ hook_event_name: 'SessionStart', source: 'resume' }, ctx),
    ).toMatchObject({
      kind: 'session.start',
      data: { source: 'resume', model: null },
    })
    expect(
      normalizeClaudeHook({ hook_event_name: 'SessionEnd', reason: 'clear' }, ctx),
    ).toMatchObject({
      kind: 'session.end',
    })
  })

  it('ignores unknown events and garbage', () => {
    expect(normalizeClaudeHook({ hook_event_name: 'PreCompact' }, ctx)).toBeNull()
    expect(normalizeClaudeHook('nope', ctx)).toBeNull()
  })
})
