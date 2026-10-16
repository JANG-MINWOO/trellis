// User settings (settings.json) and the small enums they use.

export type Language = 'ko' | 'en'
export type ThemePreference = 'system' | 'dark' | 'light'
export type LaunchMode = 'continue' | 'new'
/**
 * How Claude handles permission prompts when Trellis starts it. 'claude-default' passes nothing
 * and lets the user's Claude Code settings decide; 'bypass' is --dangerously-skip-permissions.
 */
export type PermissionMode =
  'claude-default' | 'manual' | 'acceptEdits' | 'auto' | 'plan' | 'bypass'
/**
 * 'ask' asks once which editor to use; 'app' uses a detected editor (Settings.editor.app);
 * 'reveal' shows the file in Finder/Explorer instead of opening it.
 */
export type EditorKind = 'ask' | 'app' | 'system' | 'reveal' | 'custom'
export type AgentId = 'claude-code'

export interface EditorApp {
  id: string
  name: string
}

export interface Settings {
  /** null until the user picks a language on first run. */
  language: Language | null
  theme: ThemePreference
  claude: {
    /** Empty string means "find it on PATH". */
    path: string
    /** Extra CLI arguments, parsed like a shell command line. */
    extraArgs: string
    defaultMode: LaunchMode
    /** Permission mode preselected when a session starts (changeable per launch). */
    permissionMode: PermissionMode
    /**
     * What happens when a project opens: 'ask' shows the launch card (choose permissions and
     * continue/new), 'start' launches right away with the defaults above.
     */
    onProjectOpen: 'ask' | 'start'
  }
  editor: { kind: EditorKind; app: string; customPath: string }
  terminal: {
    fontSize: number
    fontFamily: string
    /** WebGL rendering. Off by default: the DOM renderer is slower but never fails to repaint. */
    gpu: boolean
    /**
     * Native input box under Claude tabs. Text is composed by the OS (Korean IME works) and sent
     * as one paste, which avoids Claude Code's jamo-splitting bug after switching languages.
     */
    composer: boolean
  }
  notifications: { enabled: boolean }
  /** Headless analysis of finished turns (decisions, behavior changes). */
  analysis: { model: string }
  lastProjectId: string | null
}

export type SettingsPatch = {
  [K in keyof Settings]?: Settings[K] extends object
    ? Settings[K] extends unknown[]
      ? Settings[K]
      : Partial<Settings[K]>
    : Settings[K]
}
