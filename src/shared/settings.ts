// Settings come from a JSON file a user (or an older version) may have edited. Coerce every field
// so a bad value falls back to its default instead of breaking the app.
import { DEFAULT_SETTINGS } from './defaults'
import type {
  EditorKind,
  Language,
  LaunchMode,
  PermissionMode,
  Project,
  ProjectPatch,
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
      permissionMode: oneOf<PermissionMode>(
        claude.permissionMode,
        ['claude-default', 'manual', 'acceptEdits', 'auto', 'plan', 'bypass'],
        d.claude.permissionMode,
      ),
      // 0.1.0 had autoStart; the launch card now asks by default so permissions are a choice.
      onProjectOpen: oneOf<'ask' | 'start'>(
        claude.onProjectOpen,
        ['ask', 'start'],
        d.claude.onProjectOpen,
      ),
    },
    editor: normalizeEditor(editor),
    terminal: {
      fontSize: num(terminal.fontSize, d.terminal.fontSize, 9, 28),
      fontFamily: str(terminal.fontFamily, d.terminal.fontFamily),
      gpu: bool(terminal.gpu, d.terminal.gpu),
      composer: bool(terminal.composer, d.terminal.composer),
    },
    notifications: { enabled: bool(notifications.enabled, d.notifications.enabled) },
    analysis: { model: str(obj(r.analysis).model, d.analysis.model) || d.analysis.model },
    lastProjectId: typeof r.lastProjectId === 'string' ? r.lastProjectId : null,
  }
}

/** 0.1.0 stored 'auto' | 'vscode' | 'cursor'; those map onto 'ask' and detected apps. */
function normalizeEditor(editor: Record<string, unknown>): Settings['editor'] {
  const d = DEFAULT_SETTINGS.editor
  const customPath = str(editor.customPath, d.customPath)
  if (editor.kind === 'vscode' || editor.kind === 'cursor') {
    return { kind: 'app', app: editor.kind, customPath }
  }
  if (editor.kind === 'auto') return { kind: 'ask', app: '', customPath }
  return {
    kind: oneOf<EditorKind>(editor.kind, ['ask', 'app', 'system', 'reveal', 'custom'], d.kind),
    app: str(editor.app, d.app),
    customPath,
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

/**
 * Project settings arrive over IPC. Keep only known fields with the right types: the check command
 * runs at the end of every turn, so nothing unexpected may slip into it.
 */
export function normalizeProjectPatch(raw: unknown): ProjectPatch {
  const r = obj(raw)
  const patch: ProjectPatch = {}
  if (typeof r.name === 'string') patch.name = r.name.slice(0, 200)
  if (r.recordLanguage === null || r.recordLanguage === 'ko' || r.recordLanguage === 'en')
    patch.recordLanguage = r.recordLanguage
  if (typeof r.decisionsDir === 'string') patch.decisionsDir = r.decisionsDir.slice(0, 500)
  if (typeof r.specsDir === 'string') patch.specsDir = r.specsDir.slice(0, 500)
  if (typeof r.analysisEnabled === 'boolean') patch.analysisEnabled = r.analysisEnabled
  if (Array.isArray(r.riskAreas))
    patch.riskAreas = r.riskAreas
      .filter((g): g is string => typeof g === 'string')
      .map((g) => g.slice(0, 500))
      .slice(0, 200)
  if (r.guard !== undefined) {
    const g = obj(r.guard)
    const guard: NonNullable<ProjectPatch['guard']> = {}
    if (typeof g.enforceRules === 'boolean') guard.enforceRules = g.enforceRules
    if (typeof g.checkCommand === 'string') guard.checkCommand = g.checkCommand.slice(0, 1000)
    if (Object.keys(guard).length > 0) patch.guard = guard
  }
  return patch
}

/** Language of Trellis' own menus, dialogs and notifications (English until one is chosen). */
export function uiLanguage(settings: Settings): Language {
  return settings.language ?? 'en'
}

/** Language of the records Trellis writes into a project. */
export function recordLanguageOf(
  project: Pick<Project, 'recordLanguage'>,
  settings: Settings,
): Language {
  return project.recordLanguage ?? uiLanguage(settings)
}
