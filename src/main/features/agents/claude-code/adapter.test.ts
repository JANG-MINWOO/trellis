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
