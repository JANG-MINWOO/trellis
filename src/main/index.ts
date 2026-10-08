import path from 'node:path'
import { app, BrowserWindow, dialog, nativeTheme } from 'electron'
import { Push } from '@shared/ipc'
import { translate } from '@shared/i18n'
import type { AppContext } from './context'
import { claudeCodeAdapter } from './features/agents'
import { BridgeServer } from './features/bridge'
import { ChangesService, Git } from './features/changes'
import { EventStore } from './features/events'
import { notifyForEvent } from './features/notify'
import { ProjectRegistry } from './features/projects'
import { SettingsStore } from './features/settings'
import { PtyManager, TerminalService } from './features/terminal'
import { ProjectWatcher } from './features/watcher'
import { registerIpc } from './ipc'
import { buildAppMenu } from './menu'
import { resolveShellEnv } from './platform/shell-env'
import { configureUserData } from './platform/user-data'
import { findExecutable } from './platform/which'
import { applyTitleBarTheme, createMainWindow } from './window'

app.setName('Trellis')
configureUserData(app)

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  void app.whenReady().then(bootstrap)
}

async function bootstrap(): Promise<void> {
  const dataDir = app.getPath('userData')
  const projectsDir = path.join(dataDir, 'projects')
  const shellEnv = resolveShellEnv()
  let shellEnvResolved = false
  let git: Git | null = null
  const env = async (): Promise<NodeJS.ProcessEnv> => (await shellEnv).env
  void shellEnv.then((result) => {
    shellEnvResolved = result.resolved
    const gitPath = findExecutable('git', result.env)
    git = gitPath ? new Git(gitPath, () => result.env) : null
  })

  const settings = await SettingsStore.load(path.join(dataDir, 'settings.json'))
  nativeTheme.themeSource = settings.get().theme
  const registry = await ProjectRegistry.load(path.join(dataDir, 'projects.json'))
  const events = new EventStore(projectsDir)
  const bridge = new BridgeServer()
  await bridge.start()
  const adapter = claudeCodeAdapter
  const bridgeConfigFile = await adapter.prepareBridge(
    path.join(dataDir, 'agents', adapter.id),
    bridge.url,
  )
  const ptys = new PtyManager()
  const changes = new ChangesService(() => git, projectsDir)
  const watcher = new ProjectWatcher()
  let mainWindow: BrowserWindow | null = null

  const terminals = new TerminalService({
    ptys,
    registry,
    adapter,
    settings: () => settings.get(),
    baseEnv: env,
    bridge: () => ({ token: bridge.token, configFile: bridgeConfigFile }),
    beforeClaudeLaunch: (projectId, root) => changes.snapshotSession(projectId, root),
  })

  const ctx: AppContext = {
    dataDir,
    settings,
    registry,
    events,
    bridge,
    adapter,
    ptys,
    terminals,
    changes,
    watcher,
    env,
    shellEnvResolved: () => shellEnvResolved,
    git: () => git,
    window: () => mainWindow,
  }

  const send = (channel: string, ...args: unknown[]): void => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, ...args)
  }

  bridge.on('payload', ({ raw, projectId, terminalId, receivedAt }) => {
    const project = registry.get(projectId)
    if (!project) return
    const event = adapter.normalize(raw, {
      projectId,
      projectRoot: project.path,
      terminalId,
      now: receivedAt,
    })
    if (!event) return
    terminals.noteAgentEvent(terminalId, event.sessionId)
    void events
      .append(event)
      .then(() => notifyForEvent(event, project.name, settings.get(), mainWindow))
  })
  events.on('event', (event) => send(Push.event, event))
  ptys.on('data', (message) => send(Push.terminalData, message))
  ptys.on('update', (info) => send(Push.terminalUpdate, info))
  watcher.on('changed', (projectId) => send(Push.projectFsChanged, projectId))

  const rebuildMenu = (): void =>
    buildAppMenu(settings.get().language ?? 'en', (command) => send(Push.menuCommand, command))
  settings.on('change', (next) => {
    nativeTheme.themeSource = next.theme
    rebuildMenu()
    send(Push.settingsChanged, next)
  })
  nativeTheme.on('updated', () => applyTitleBarTheme(mainWindow))

  registerIpc(ctx)
  rebuildMenu()

  const openWindow = async (): Promise<void> => {
    mainWindow = await createMainWindow(dataDir)
    mainWindow.on('closed', () => {
      mainWindow = null
      watcher.stop()
    })
  }
  await openWindow()

  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void openWindow()
  })

  let quitConfirmed = false
  app.on('before-quit', (event) => {
    const running = ptys.runningCount('claude')
    if (quitConfirmed || running === 0 || process.env.TRELLIS_E2E === '1') return
    const lang = settings.get().language ?? 'en'
    const choice = dialog.showMessageBoxSync({
      type: 'question',
      buttons: [translate(lang, 'quit.confirm'), translate(lang, 'common.cancel')],
      defaultId: 1,
      cancelId: 1,
      message: translate(lang, 'quit.title'),
      detail: translate(lang, 'quit.detail', { count: running }),
    })
    if (choice === 0) quitConfirmed = true
    else event.preventDefault()
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  app.on('will-quit', () => {
    ptys.disposeAll()
    watcher.stop()
    void bridge.stop()
  })
}
