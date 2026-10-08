// Settings come from a JSON file a user (or an older version) may have edited. Coerce every field
// so a bad value falls back to its default instead of breaking the app.
import { DEFAULT_SETTINGS } from './defaults'
import type {
  EditorKind,
  Language,
  LaunchMode,
  Settings,
  SettingsPatch,
  ThemePreference,
} from './types'

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback

const str = (value: unknown, fallback: string): string =>
  typeof value === 'string' ? value : fallback
const bool = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback
const num = (value: unknown, fallback: number, min: number, max: number): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback
const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

export function normalizeSettings(raw: unknown): Settings {
  const r = obj(raw)
  const d = DEFAULT_SETTINGS
  const claude = obj(r.claude)
  const editor = obj(r.editor)
  const terminal = obj(r.terminal)
  const notifications = obj(r.notifications)
  return {
    language:
      r.language === null ? null : oneOf<Language>(r.language, ['ko', 'en'], d.language ?? 'en'),
    theme: oneOf<ThemePreference>(r.theme, ['system', 'dark', 'light'], d.theme),
    claude: {
      path: str(claude.path, d.claude.path),
      extraArgs: str(claude.extraArgs, d.claude.extraArgs),
      defaultMode: oneOf<LaunchMode>(claude.defaultMode, ['continue', 'new'], d.claude.defaultMode),
      autoStart: bool(claude.autoStart, d.claude.autoStart),
    },
    editor: {
      kind: oneOf<EditorKind>(
        editor.kind,
        ['auto', 'vscode', 'cursor', 'system', 'custom'],
        d.editor.kind,
      ),
      customPath: str(editor.customPath, d.editor.customPath),
    },
    terminal: {
      fontSize: num(terminal.fontSize, d.terminal.fontSize, 9, 28),
      fontFamily: str(terminal.fontFamily, d.terminal.fontFamily),
    },
    notifications: { enabled: bool(notifications.enabled, d.notifications.enabled) },
    lastProjectId: typeof r.lastProjectId === 'string' ? r.lastProjectId : null,
  }
}

/** Applies a patch one level deep (nested groups are merged, not replaced). */
export function applySettingsPatch(current: Settings, patch: SettingsPatch): Settings {
  const merged: Record<string, unknown> = { ...current }
  for (const [key, value] of Object.entries(patch)) {
    const existing = (current as unknown as Record<string, unknown>)[key]
    merged[key] =
      value && typeof value === 'object' && existing && typeof existing === 'object'
        ? { ...(existing as object), ...(value as object) }
        : value
  }
  // The language stays null only until chosen; a fresh file has no "language" key at all.
  return normalizeSettings({ ...merged, language: merged.language ?? null })
}
