import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from './defaults'
import { applySettingsPatch, normalizeSettings } from './settings'

describe('normalizeSettings', () => {
  it('fills defaults for an empty file and keeps language unset', () => {
    const s = normalizeSettings({})
    expect(s.theme).toBe('system')
    expect(s.claude.defaultMode).toBe('continue')
    expect(s.language).toBe('en')
    expect(normalizeSettings({ language: null }).language).toBeNull()
  })

  it('coerces invalid values to defaults and clamps numbers', () => {
    const s = normalizeSettings({
      theme: 'neon',
      terminal: { fontSize: 99 },
      editor: { kind: 'emacs' },
    })
    expect(s.theme).toBe(DEFAULT_SETTINGS.theme)
    expect(s.terminal.fontSize).toBe(28)
    expect(s.editor.kind).toBe('ask')
  })

  it('migrates 0.1.0 editor values', () => {
    expect(normalizeSettings({ editor: { kind: 'vscode' } }).editor).toEqual({
      kind: 'app',
      app: 'vscode',
      customPath: '',
    })
    expect(normalizeSettings({ editor: { kind: 'auto' } }).editor.kind).toBe('ask')
    expect(normalizeSettings({ claude: {} }).claude.permissionMode).toBe('claude-default')
    expect(normalizeSettings({ terminal: {} }).terminal.gpu).toBe(false)
  })
})

describe('applySettingsPatch', () => {
  it('merges nested groups instead of replacing them', () => {
    const next = applySettingsPatch(DEFAULT_SETTINGS, {
      claude: { extraArgs: '--model opus' },
      language: 'ko',
    })
    expect(next.claude.extraArgs).toBe('--model opus')
    expect(next.claude.defaultMode).toBe('continue')
    expect(next.language).toBe('ko')
  })
})
