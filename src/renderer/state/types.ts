// Shape of the renderer store, one interface per slice (ADR-0032). Data comes from main through
// window.trellis; nothing here is persisted except through main (settings, projects, events).
import type { StateCreator } from 'zustand'
import type {
  AppInfo,
  Baseline,
  ChangeReport,
  LaunchMode,
  PermissionMode,
  ProjectView,
  Settings,
  SettingsPatch,
  TerminalInfo,
  TerminalKind,
  TerminalStartResult,
  TrellisEvent,
} from '@shared/types'

export type RightTab = 'timeline' | 'changes' | 'decisions' | 'specs' | 'health'
export type SettingsSection = 'general' | 'claude' | 'editor' | 'terminal' | 'project'

export interface Toast {
  id: number
  kind: 'info' | 'success' | 'error'
  message: string
}

export type StartError = Extract<TerminalStartResult, { ok: false }>

export interface StartOptions {
  mode?: LaunchMode
  /** Open this conversation again (ADR-0035). */
  sessionId?: string
  permissionMode?: PermissionMode
  /** Restart this tab instead of picking one. */
  terminalId?: string
  /** Open another tab. */
  newTab?: boolean
}

export interface AppSlice {
  booted: boolean
  isDark: boolean
  appInfo: AppInfo | null
  settings: Settings | null
  boot(): Promise<void>
  updateSettings(patch: SettingsPatch): Promise<void>
}

export interface ProjectsSlice {
  projects: ProjectView[]
  activeProjectId: string | null
  refreshProjects(): Promise<void>
  selectProject(id: string | null): Promise<void>
  addProject(): Promise<void>
  removeProject(id: string): Promise<void>
}

/** The event ledger per project and what main reports about background work. */
export interface LedgerSlice {
  events: Record<string, TrellisEvent[]>
  /** A finished turn is being analyzed for decisions and behavior changes. */
  analyzing: Record<string, boolean>
  /** The end-of-turn check (rules + check command) is running; the agent waits for it. */
  checking: Record<string, boolean>
  fsTick: Record<string, number>
  loadEvents(projectId: string): Promise<void>
}

export interface TerminalsSlice {
  terminals: Record<string, TerminalInfo>
  /** Selected tab (terminal id) per project. */
  activeTab: Record<string, string | null>
  startErrors: Record<string, StartError | undefined>
  startTerminal(projectId: string, kind: TerminalKind, options?: StartOptions): Promise<void>
  setActiveTab(projectId: string, terminalId: string | null): void
  closeTerminal(terminalId: string): Promise<void>
}

export interface ChangesSlice {
  changes: Record<string, ChangeReport | undefined>
  changesLoading: Record<string, boolean>
  baseline: Baseline
  refreshChanges(projectId: string, immediate?: boolean): void
  setBaseline(baseline: Baseline): void
}

export interface UiSlice {
  rightTab: RightTab
  settingsOpen: boolean
  settingsSection: SettingsSection
  toasts: Toast[]
  /** Set when a file should open but no editor has been chosen yet. */
  editorChooser: { projectId: string; path: string } | null
  /** Bumped when the user asks to collapse/expand side panels from the menu or title bar. */
  panelToggle: { side: 'left' | 'right'; n: number } | null
  /** Opens a file in the chosen editor, asking once which editor that is. */
  openFile(projectId: string, path: string): Promise<void>
  closeEditorChooser(): void
  setRightTab(tab: RightTab): void
  openSettings(section?: SettingsSection): void
  closeSettings(): void
  toast(kind: Toast['kind'], message: string): void
  dismissToast(id: number): void
  togglePanel(side: 'left' | 'right'): void
}

export type StoreState = AppSlice &
  ProjectsSlice &
  LedgerSlice &
  TerminalsSlice &
  ChangesSlice &
  UiSlice

export type Slice<T> = StateCreator<StoreState, [], [], T>
