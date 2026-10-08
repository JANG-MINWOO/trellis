import type { BrowserWindow } from 'electron'
import type { AgentAdapter } from './features/agents'
import type { BridgeServer } from './features/bridge'
import type { ChangesService, Git } from './features/changes'
import type { EventStore } from './features/events'
import type { ProjectRegistry } from './features/projects'
import type { SettingsStore } from './features/settings'
import type { PtyManager, TerminalService } from './features/terminal'
import type { ProjectWatcher } from './features/watcher'

/** Services wired together at startup; passed to IPC handlers. */
export interface AppContext {
  dataDir: string
  settings: SettingsStore
  registry: ProjectRegistry
  events: EventStore
  bridge: BridgeServer
  adapter: AgentAdapter
  ptys: PtyManager
  terminals: TerminalService
  changes: ChangesService
  watcher: ProjectWatcher
  env(): Promise<NodeJS.ProcessEnv>
  shellEnvResolved(): boolean
  git(): Git | null
  window(): BrowserWindow | null
}
