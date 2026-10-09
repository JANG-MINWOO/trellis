// The contract between main and renderer. preload implements TrellisApi on top of these channels.
import type {
  AppInfo,
  BehaviorResolution,
  DecisionResolution,
  IntentData,
  SpecList,
  EditorApp,
  Baseline,
  ChangeReport,
  DecisionList,
  EnvironmentStatus,
  FileNode,
  HealthReport,
  ProjectPatch,
  ProjectView,
  Settings,
  SettingsPatch,
  TerminalInfo,
  TerminalStartRequest,
  TerminalStartResult,
  TrellisEvent,
} from './types'

/** Request/response channels (ipcRenderer.invoke ↔ ipcMain.handle). */
export const Invoke = {
  appInfo: 'app:info',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  envCheck: 'env:check',
  projectsList: 'projects:list',
  projectsAddDialog: 'projects:add-dialog',
  projectsRemove: 'projects:remove',
  projectsUpdate: 'projects:update',
  projectsOpened: 'projects:opened',
  projectsReveal: 'projects:reveal',
  filesList: 'files:list',
  editorOpen: 'editor:open',
  editorList: 'editor:list',
  terminalStart: 'terminal:start',
  terminalKill: 'terminal:kill',
  terminalClose: 'terminal:close',
  terminalList: 'terminal:list',
  terminalAttach: 'terminal:attach',
  eventsList: 'events:list',
  intentSave: 'intent:save',
  changesGet: 'changes:get',
  changesResetBaseline: 'changes:reset-baseline',
  gitInit: 'git:init',
  decisionsList: 'decisions:list',
  decisionsResolve: 'decisions:resolve',
  specsList: 'specs:list',
  behaviorsResolve: 'behaviors:resolve',
  behaviorsFromIntent: 'behaviors:from-intent',
  projectAreas: 'projects:areas',
  healthGet: 'health:get',
  watchProject: 'project:watch',
} as const

/** Fire-and-forget channels from renderer to main (ipcRenderer.send ↔ ipcMain.on). */
export const Send = {
  terminalWrite: 'terminal:write',
  terminalResize: 'terminal:resize',
  terminalPasteImage: 'terminal:paste-image',
} as const

/** Push channels from main to renderer (webContents.send ↔ ipcRenderer.on). */
export const Push = {
  terminalData: 'push:terminal-data',
  terminalUpdate: 'push:terminal-update',
  terminalRemoved: 'push:terminal-removed',
  event: 'push:event',
  projectFsChanged: 'push:project-fs-changed',
  settingsChanged: 'push:settings-changed',
  menuCommand: 'push:menu-command',
  analysisStatus: 'push:analysis-status',
} as const

export type MenuCommand =
  | 'open-folder'
  | 'open-settings'
  | 'toggle-left'
  | 'toggle-right'
  | 'claude-continue'
  | 'claude-new'
  | 'claude-new-tab'

export interface TerminalDataMessage {
  terminalId: string
  data: string
}

export type Unsubscribe = () => void

export interface TrellisApi {
  app: { info(): Promise<AppInfo> }
  settings: {
    get(): Promise<Settings>
    update(patch: SettingsPatch): Promise<Settings>
    onChange(cb: (settings: Settings) => void): Unsubscribe
  }
  environment: { check(): Promise<EnvironmentStatus> }
  projects: {
    list(): Promise<ProjectView[]>
    /** Opens a native folder picker. Resolves null when cancelled. */
    addViaDialog(): Promise<ProjectView | null>
    remove(projectId: string): Promise<void>
    update(projectId: string, patch: ProjectPatch): Promise<ProjectView>
    markOpened(projectId: string): Promise<void>
    reveal(projectId: string, relPath?: string): Promise<void>
    /** Tell main which project to watch for file changes (null to stop). */
    watch(projectId: string | null): Promise<void>
    /** Feature areas of the project with file counts, for predicting where a task will land. */
    areas(projectId: string): Promise<{ area: string; files: number }[]>
    onFsChanged(cb: (projectId: string) => void): Unsubscribe
  }
  files: {
    list(projectId: string, relDir: string): Promise<FileNode[]>
    /** Absolute path of a file dropped from Finder/Explorer ('' if it has none). */
    pathForFile(file: File): string
  }
  editor: {
    open(projectId: string, relPath: string): Promise<{ ok: boolean; message?: string }>
    /** Editors found on this computer. */
    list(): Promise<EditorApp[]>
  }
  terminal: {
    start(req: TerminalStartRequest): Promise<TerminalStartResult>
    write(terminalId: string, data: string): void
    resize(terminalId: string, cols: number, rows: number): void
    /** Asks the agent to read the clipboard image (its own paste-image key). */
    pasteImage(terminalId: string): void
    /** Ends the process; the tab stays and shows how to restart. */
    kill(terminalId: string): Promise<void>
    /** Ends the process and removes the tab. */
    close(terminalId: string): Promise<void>
    list(): Promise<TerminalInfo[]>
    /** Returns buffered output so a reloaded renderer can redraw a live terminal. */
    attach(terminalId: string): Promise<string>
    onData(cb: (msg: TerminalDataMessage) => void): Unsubscribe
    onUpdate(cb: (terminal: TerminalInfo) => void): Unsubscribe
    onRemoved(cb: (terminalId: string) => void): Unsubscribe
  }
  events: {
    list(projectId: string, limit?: number): Promise<TrellisEvent[]>
    onEvent(cb: (event: TrellisEvent) => void): Unsubscribe
  }
  intent: { save(projectId: string, intent: IntentData): Promise<TrellisEvent> }
  changes: {
    get(projectId: string, baseline: Baseline): Promise<ChangeReport>
    resetBaseline(projectId: string): Promise<void>
    initRepo(projectId: string): Promise<{ ok: boolean; message?: string }>
  }
  decisions: {
    list(projectId: string): Promise<DecisionList>
    /** Records (accepted) or drops (dismissed) a candidate. Accepted ones become a record file. */
    resolve(
      projectId: string,
      candidateId: string,
      answer: Pick<DecisionResolution, 'resolution' | 'reason' | 'reasonFromGuess'>,
    ): Promise<{ ok: boolean; docPath: string | null; message?: string }>
  }
  specs: {
    list(projectId: string): Promise<SpecList>
    resolve(
      projectId: string,
      candidateId: string,
      answer: Pick<BehaviorResolution, 'resolution' | 'statement' | 'area'>,
    ): Promise<{ ok: boolean; specPath: string | null; message?: string }>
    /** Turns "must not" lines of an intent into invariant candidates. */
    fromIntent(projectId: string, lines: string[], area: string): Promise<void>
  }
  analysis: { onStatus(cb: (status: { projectId: string; running: boolean }) => void): Unsubscribe }
  health: { get(projectId: string): Promise<HealthReport | null> }
  menu: { onCommand(cb: (command: MenuCommand) => void): Unsubscribe }
}
