import { describe, expect, it } from 'vitest'
import type { PermissionMode } from '@shared/types'
import { claudeCodeAdapter } from './adapter'

describe('claudeCodeAdapter.launchArgs', () => {
  const base = {
    bridgeConfigFile: '/data/claude-settings.json',
    extraArgs: [] as string[],
    permissionMode: 'claude-default' as const,
  }

  it('continues or starts a session with a known id', () => {
    expect(claudeCodeAdapter.launchArgs({ ...base, mode: 'continue', sessionId: null })).toEqual([
      '--settings',
      '/data/claude-settings.json',
      '--continue',
    ])
    expect(claudeCodeAdapter.launchArgs({ ...base, mode: 'new', sessionId: 'abc' })).toEqual([
      '--settings',
      '/data/claude-settings.json',
      '--session-id',
      'abc',
    ])
  })

  it('maps permission modes to CLI flags', () => {
    const args = (permissionMode: PermissionMode) =>
      claudeCodeAdapter
        .launchArgs({ ...base, mode: 'new', sessionId: 's', permissionMode })
        .slice(4)
    expect(args('claude-default')).toEqual([])
    expect(args('manual')).toEqual(['--permission-mode', 'manual'])
    expect(args('acceptEdits')).toEqual(['--permission-mode', 'acceptEdits'])
    expect(args('bypass')).toEqual(['--dangerously-skip-permissions'])
    const userOverrides = claudeCodeAdapter.launchArgs({
      ...base,
      mode: 'new',
      sessionId: 's',
      permissionMode: 'bypass',
      extraArgs: ['--permission-mode', 'plan'],
    })
    expect(userOverrides).not.toContain('--dangerously-skip-permissions')
  })

  it('lets user arguments pick the session instead', () => {
    const args = claudeCodeAdapter.launchArgs({
      ...base,
      mode: 'continue',
      sessionId: null,
      extraArgs: ['--resume', 'xyz', '--model', 'opus'],
    })
    expect(args).toEqual([
      '--settings',
      '/data/claude-settings.json',
      '--resume',
      'xyz',
      '--model',
      'opus',
    ])
  })
})

describe('claudeCodeAdapter.scrubInheritedEnv', () => {
  it('removes parent-session markers and keeps user configuration', () => {
    const env: Record<string, string> = {
      CLAUDECODE: '1',
      CLAUDE_CODE_CHILD_SESSION: '1',
      CLAUDE_CODE_SESSION_ID: 'x',
      CLAUDE_CODE_MESSAGING_TOKEN: 'secret',
      CLAUDE_PID: '1',
      AI_AGENT: 'claude-code',
      CLAUDE_CONFIG_DIR: '/cfg',
      CLAUDE_CODE_USE_BEDROCK: '1',
      PATH: '/bin',
    }
    claudeCodeAdapter.scrubInheritedEnv(env)
    expect(env).toEqual({ CLAUDE_CONFIG_DIR: '/cfg', CLAUDE_CODE_USE_BEDROCK: '1', PATH: '/bin' })
  })
})

describe('claudeCodeAdapter headless', () => {
  it('isolates the run and asks for structured JSON', () => {
    const args = claudeCodeAdapter.headlessArgs({ schema: { type: 'object' }, model: 'sonnet' })
    expect(args).toEqual(
      expect.arrayContaining([
        '-p',
        '--restricted',
        '--strict-mcp-config',
        '--no-session-persistence',
      ]),
    )
    expect(args[args.indexOf('--tools') + 1]).toBe('')
    expect(args[args.indexOf('--json-schema') + 1]).toBe('{"type":"object"}')
  })

  it('reads structured_output and reports errors', () => {
    expect(
      claudeCodeAdapter.parseHeadless(
        JSON.stringify({
          subtype: 'success',
          is_error: false,
          structured_output: { decisions: [] },
        }),
      ),
    ).toEqual({ ok: true, data: { decisions: [] } })
    expect(
      claudeCodeAdapter.parseHeadless(
        JSON.stringify({ subtype: 'error_max_turns', is_error: true, result: 'x' }),
      ).ok,
    ).toBe(false)
    expect(claudeCodeAdapter.parseHeadless('not json').ok).toBe(false)
  })
})

describe('claudeCodeAdapter.imagePasteKeys', () => {
  it('uses Ctrl+V on macOS/Linux and Alt+V on Windows', () => {
    expect(claudeCodeAdapter.imagePasteKeys('darwin')).toBe('\x16')
    expect(claudeCodeAdapter.imagePasteKeys('linux')).toBe('\x16')
    expect(claudeCodeAdapter.imagePasteKeys('win32')).toBe('\x1bv')
  })
})

describe('claudeCodeAdapter.isNothingToContinue', () => {
  it('recognizes the CLI message', () => {
    expect(
      claudeCodeAdapter.isNothingToContinue('\x1b[2mNo conversation found to continue\x1b[0m'),
    ).toBe(true)
    expect(claudeCodeAdapter.isNothingToContinue('Welcome')).toBe(false)
  })
})

describe('claudeCodeAdapter Stop hook replies', () => {
  it('holds only Stop long enough for the checks, and answers before the hook times out', () => {
    const stop = claudeCodeAdapter.replyTimeoutMs({ hook_event_name: 'Stop' })
    expect(stop).toBe(claudeCodeAdapter.stopReplyMs)
    expect(stop).toBeLessThan(120_000)
    expect(claudeCodeAdapter.replyTimeoutMs({ hook_event_name: 'PostToolUse' })).toBe(1500)
    expect(claudeCodeAdapter.replyTimeoutMs(null)).toBe(1500)
  })

  it('recognizes a stop that follows a block, and builds the block reply', () => {
    expect(
      claudeCodeAdapter.isContinuedStop({ hook_event_name: 'Stop', stop_hook_active: true }),
    ).toBe(true)
    expect(claudeCodeAdapter.isContinuedStop({ hook_event_name: 'Stop' })).toBe(false)
    expect(claudeCodeAdapter.blockStopReply('fix it')).toEqual({
      decision: 'block',
      reason: 'fix it',
    })
  })
})
