// App-wide UI state. Data comes from main via window.trellis; nothing here is persisted except
// through main (settings, projects, events).
import { create } from 'zustand'
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
import i18n, { setLanguage } from '../i18n'
import { api } from '../lib/api'

export type RightTab = 'timeline' | 'changes' | 'decisions' | 'specs' | 'health'
export type SettingsSection = 'general' | 'claude' | 'editor' | 'terminal' | 'project'

export interface Toast {
  id: number
  kind: 'info' | 'success' | 'error'
  message: string
}

type StartError = Extract<TerminalStartResult, { ok: false }>

export interface StartOptions {
  mode?: LaunchMode
  permissionMode?: PermissionMode
  /** Restart this tab instead of picking one. */
  terminalId?: string
  /** Open another tab. */
  newTab?: boolean
}

interface State {
  booted: boolean
  isDark: boolean
  appInfo: AppInfo | null
  settings: Settings | null
  projects: ProjectView[]
  activeProjectId: string | null
  events: Record<string, TrellisEvent[]>
  terminals: Record<string, TerminalInfo>
  /** Selected tab (terminal id) per project. */
  activeTab: Record<string, string | null>
  startErrors: Record<string, StartError | undefined>
  changes: Record<string, ChangeReport | undefined>
  changesLoading: Record<string, boolean>
  /** A finished turn is being analyzed for decisions and behavior changes. */
  analyzing: Record<string, boolean>
  /** The end-of-turn check (rules + check command) is running; the agent waits for it. */
  checking: Record<string, boolean>
  baseline: Baseline
  fsTick: Record<string, number>
  rightTab: RightTab
  settingsOpen: boolean
  settingsSection: SettingsSection
  toasts: Toast[]
  /** Set when a file should open but no editor has been chosen yet. */
  editorChooser: { projectId: string; path: string } | null
  /** Bumped when the user asks to collapse/expand side panels from the menu or title bar. */
  panelToggle: { side: 'left' | 'right'; n: number } | null
}

interface Actions {
  boot(): Promise<void>
  subscribe(): () => void
  updateSettings(patch: SettingsPatch): Promise<void>
  refreshProjects(): Promise<void>
  selectProject(id: string | null): Promise<void>
  addProject(): Promise<void>
  removeProject(id: string): Promise<void>
  loadEvents(projectId: string): Promise<void>
  startTerminal(projectId: string, kind: TerminalKind, options?: StartOptions): Promise<void>
  setActiveTab(projectId: string, terminalId: string | null): void
  closeTerminal(terminalId: string): Promise<void>
  /** Opens a file in the chosen editor, asking once which editor that is. */
  openFile(projectId: string, path: string): Promise<void>
  closeEditorChooser(): void
  refreshChanges(projectId: string, immediate?: boolean): void
  setBaseline(baseline: Baseline): void
  setRightTab(tab: RightTab): void
  openSettings(section?: SettingsSection): void
  closeSettings(): void
  toast(kind: Toast['kind'], message: string): void
  dismissToast(id: number): void
  togglePanel(side: 'left' | 'right'): void
}

const DEFAULT_SIZE = { cols: 100, rows: 30 }
const changeTimers = new Map<string, number>()
let toastSeq = 0

export const useStore = create<State & Actions>()((set, get) => ({
  booted: false,
  isDark: true,
  appInfo: null,
  settings: null,
  projects: [],
  activeProjectId: null,
  events: {},
  terminals: {},
  activeTab: {},
  startErrors: {},
  changes: {},
  changesLoading: {},
  analyzing: {},
  checking: {},
  baseline: 'session',
  fsTick: {},
  rightTab: 'timeline',
  settingsOpen: false,
  settingsSection: 'general',
  toasts: [],
  editorChooser: null,
  panelToggle: null,

  async boot() {
    const [appInfo, settings, projects, terminals] = await Promise.all([
      api.app.info(),
      api.settings.get(),
      api.projects.list(),
      api.terminal.list(),
    ])
    setLanguage(settings.language ?? (appInfo.locale.toLowerCase().startsWith('ko') ? 'ko' : 'en'))
    set({
      appInfo,
      settings,
      projects,
      terminals: Object.fromEntries(terminals.map((t) => [t.id, t])),
      booted: true,
    })
    const last =
      settings.lastProjectId && projects.find((p) => p.id === settings.lastProjectId && !p.missing)
    if (last) await get().selectProject(last.id)
  },

  subscribe() {
    const offs = [
      api.settings.onChange((settings) => {
        if (settings.language) setLanguage(settings.language)
        set({ settings })
      }),
      api.terminal.onUpdate((info) =>
        set((s) => ({ terminals: { ...s.terminals, [info.id]: info } })),
      ),
      api.terminal.onRemoved((terminalId) =>
        set((s) => {
          const gone = s.terminals[terminalId]
          const terminals = { ...s.terminals }
          delete terminals[terminalId]
          if (!gone || s.activeTab[gone.projectId] !== terminalId) return { terminals }
          const next = pickTab(Object.values(terminals), gone.projectId)
          return { terminals, activeTab: { ...s.activeTab, [gone.projectId]: next } }
        }),
      ),
      api.events.onEvent((event) => {
        set((s) => {
          const list = s.events[event.projectId]
          return list ? { events: { ...s.events, [event.projectId]: [...list, event] } } : {}
        })
        if (
          event.kind === 'tool.use' ||
          event.kind === 'turn.stop' ||
          event.kind === 'tool.fail' ||
          event.kind === 'turn.changes'
        ) {
          get().refreshChanges(event.projectId)
        }
      }),
      api.rules.onCheckStatus(({ projectId, running }) =>
        set((s) => ({ checking: { ...s.checking, [projectId]: running } })),
      ),
      api.analysis.onStatus(({ projectId, running }) =>
        set((s) => ({ analyzing: { ...s.analyzing, [projectId]: running } })),
      ),
      api.projects.onFsChanged((projectId) => {
        set((s) => ({ fsTick: { ...s.fsTick, [projectId]: (s.fsTick[projectId] ?? 0) + 1 } }))
        get().refreshChanges(projectId)
      }),
    ]
    return () => offs.forEach((off) => off())
  },

  async updateSettings(patch) {
    const settings = await api.settings.update(patch)
    if (settings.language) setLanguage(settings.language)
    set({ settings })
  },

  async refreshProjects() {
    set({ projects: await api.projects.list() })
  },

  async selectProject(id) {
    set({ activeProjectId: id })
    await api.projects.watch(id)
    if (!id) return
    const project = get().projects.find((p) => p.id === id)
    if (!project || project.missing) return
    await api.projects.markOpened(id)
    await Promise.all([get().loadEvents(id), get().refreshProjects()])
    get().refreshChanges(id, true)
    const settings = get().settings
    const hasClaude = Object.values(get().terminals).some(
      (t) => t.projectId === id && t.kind === 'claude',
    )
    // 'ask' leaves the launch card up so permissions and continue/new are a conscious choice.
    if (settings?.claude.onProjectOpen === 'start' && !hasClaude) {
      await get().startTerminal(id, 'claude')
    }
  },

  async addProject() {
    const project = await api.projects.addViaDialog()
    if (!project) return
    await get().refreshProjects()
    await get().selectProject(project.id)
  },

  async removeProject(id) {
    await api.projects.remove(id)
    set((s) => {
      const terminals = Object.fromEntries(
        Object.entries(s.terminals).filter(([, t]) => t.projectId !== id),
      )
      return { terminals, activeProjectId: s.activeProjectId === id ? null : s.activeProjectId }
    })
    await get().refreshProjects()
  },

  async loadEvents(projectId) {
    const events = await api.events.list(projectId)
    set((s) => ({ events: { ...s.events, [projectId]: events } }))
  },

  async startTerminal(projectId, kind, options = {}) {
    if (kind === 'claude')
      set((s) => ({ startErrors: { ...s.startErrors, [projectId]: undefined } }))
    const result = await api.terminal.start({ projectId, kind, ...options, ...DEFAULT_SIZE })
    if (result.ok) {
      set((s) => ({
        terminals: { ...s.terminals, [result.terminal.id]: result.terminal },
        activeTab: { ...s.activeTab, [projectId]: result.terminal.id },
      }))
    } else if (kind === 'claude') {
      set((s) => ({ startErrors: { ...s.startErrors, [projectId]: result } }))
    } else {
      get().toast('error', result.message)
    }
  },

  setActiveTab(projectId, terminalId) {
    set((s) => ({ activeTab: { ...s.activeTab, [projectId]: terminalId } }))
  },

  async closeTerminal(terminalId) {
    await api.terminal.close(terminalId)
  },

  async openFile(projectId, path) {
    const result = await api.editor.open(projectId, path)
    if (result.ok) return
    if (result.message === 'ask' || result.message === 'editor-missing') {
      set({ editorChooser: { projectId, path } })
    } else {
      get().toast('error', i18n.t('toast.editorFailed', { message: result.message ?? '' }))
    }
  },

  closeEditorChooser() {
    set({ editorChooser: null })
  },

  refreshChanges(projectId, immediate = false) {
    const run = async (): Promise<void> => {
      changeTimers.delete(projectId)
      set((s) => ({ changesLoading: { ...s.changesLoading, [projectId]: true } }))
      const report = await api.changes.get(projectId, get().baseline)
      set((s) => ({
        changes: { ...s.changes, [projectId]: report },
        changesLoading: { ...s.changesLoading, [projectId]: false },
      }))
    }
    const pending = changeTimers.get(projectId)
    if (pending) window.clearTimeout(pending)
    if (immediate) void run()
    else
      changeTimers.set(
        projectId,
        window.setTimeout(() => void run(), 700),
      )
  },

  setBaseline(baseline) {
    set({ baseline })
    const id = get().activeProjectId
    if (id) get().refreshChanges(id, true)
  },

  setRightTab(rightTab) {
    set({ rightTab })
  },

  openSettings(section = 'general') {
    set({ settingsOpen: true, settingsSection: section })
  },

  closeSettings() {
    set({ settingsOpen: false })
  },

  toast(kind, message) {
    const id = ++toastSeq
    set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }))
    window.setTimeout(() => get().dismissToast(id), kind === 'error' ? 6000 : 3500)
  },

  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },

  togglePanel(side) {
    set((s) => ({ panelToggle: { side, n: (s.panelToggle?.n ?? 0) + 1 } }))
  },
}))

/** The tab to show for a project: Claude tabs first, then shells, by position. */
export function pickTab(terminals: TerminalInfo[], projectId: string): string | null {
  const own = terminals
    .filter((t) => t.projectId === projectId)
    .sort((a, b) => (a.kind === b.kind ? a.index - b.index : a.kind === 'claude' ? -1 : 1))
  return own[0]?.id ?? null
}

/** Convenience selectors that return stable references. */
export const useActiveProject = (): ProjectView | null =>
  useStore((s) => s.projects.find((p) => p.id === s.activeProjectId) ?? null)
