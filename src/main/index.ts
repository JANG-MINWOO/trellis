import path from 'node:path'
import { app, BrowserWindow, dialog, nativeTheme } from 'electron'
import { Push } from '@shared/ipc'
import { detectLanguage, translate } from '@shared/i18n'
import type { AppContext } from './context'
import { claudeCodeAdapter } from './features/agents'
import { TurnAnalyzer } from './features/analysis'
import { BridgeServer } from './features/bridge'
import { HealthService } from './features/health'
import { RulesService } from './features/rules'
import { ChangesService, Git } from './features/changes'
import { EventStore } from './features/events'
import { notifyForEvent } from './features/notify'
import { ProjectRegistry } from './features/projects'
import { SettingsStore } from './features/settings'
import { PtyManager, TerminalService } from './features/terminal'
import { TurnPipeline } from './features/turns'
import { ProjectWatcher } from './features/watcher'
import { registerIpc } from './ipc'
import { buildAppMenu } from './menu'
import { resolveShellEnv } from './platform/shell-env'
import { stopAllChildren } from './platform/children'
import { isMac } from './platform/os'
import { configureUserData } from './platform/user-data'
import { newId } from './lib/ids'
import { initLog, log, logFailure } from './lib/log'
import { findExecutable } from './platform/which'
import { applyTitleBarTheme, createMainWindow } from './window'

app.setName('Trellis')
configureUserData(app)
process.on('unhandledRejection', (reason) => log.error('main', 'unhandled rejection', reason))

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app
    .whenReady()
    .then(bootstrap)
    .catch((error: unknown) => {
      // Without this the process would keep the single-instance lock with no window, and every
      // later launch would quietly hand over to it.
      log.error('startup', 'bootstrap failed', error)
      const lang = detectLanguage(app.getLocale())
      dialog.showErrorBox(
        translate(lang, 'startup.failedTitle'),
        translate(lang, 'startup.failedDetail', {
          message: error instanceof Error ? error.message : String(error),
          log: path.join(app.getPath('userData'), 'logs', 'main.log'),
        }),
      )
      app.exit(1)
    })
}

async function bootstrap(): Promise<void> {
  const dataDir = app.getPath('userData')
  await initLog(path.join(dataDir, 'logs')).catch(() => undefined)
  const projectsDir = path.join(dataDir, 'projects')
  const shellEnv = resolveShellEnv()
  let shellEnvResolved = false
  const env = async (): Promise<NodeJS.ProcessEnv> => (await shellEnv).env
  // git is looked up on the login-shell PATH, so everything that needs it waits for that first.
  const gitReady: Promise<Git | null> = shellEnv.then((result) => {
    shellEnvResolved = result.resolved
    const gitPath = findExecutable('git', result.env)
    return gitPath ? new Git(gitPath, () => result.env) : null
  })
  const git = (): Promise<Git | null> => gitReady

  const settings = await SettingsStore.load(path.join(dataDir, 'settings.json'))
  nativeTheme.themeSource = settings.get().theme
  const registry = await ProjectRegistry.load(path.join(dataDir, 'projects.json'))
  const events = new EventStore(projectsDir)
  const adapter = claudeCodeAdapter
  const ptys = new PtyManager()
  const changes = new ChangesService(git, projectsDir)
  const watcher = new ProjectWatcher()
  let mainWindow: BrowserWindow | null = null
  // terminals is created below; the bridge only needs it once payloads arrive.
  let terminals: TerminalService | null = null

  // Created below; the bridge only needs them once payloads arrive.
  let pipeline: TurnPipeline | null = null

  const bridge = new BridgeServer(async ({ raw, projectId, terminalId, receivedAt }) => {
    const project = registry.get(projectId)
    if (!project) return
    const event = adapter.normalize(raw, {
      projectId,
      projectRoot: project.path,
      terminalId,
      now: receivedAt,
    })
    if (!event) return
    terminals?.noteAgentEvent(terminalId, event.sessionId)
    // Before the prompt hook is answered (Claude waits for it), so the snapshot predates the turn.
    if (event.kind === 'prompt.submit' && event.promptId)
      await pipeline?.onPrompt(project, event.promptId)
    await events.append(event)
    if (event.kind === 'turn.stop') {
      const reason = await pipeline?.onStop(project, event, adapter.isContinuedStop(raw))
      // A turn sent back by the guard is not finished; say so only when it really is.
      if (!reason) notifyForEvent(event, project.name, settings.get(), mainWindow)
      return reason ? adapter.blockStopReply(reason) : undefined
    }
    notifyForEvent(event, project.name, settings.get(), mainWindow)
    return undefined
  }, adapter.replyTimeoutMs)
  await bridge.start()
  const bridgeConfigFile = await adapter.prepareBridge(
    path.join(dataDir, 'agents', adapter.id),
    bridge.url,
  )
  const terminalService = new TerminalService({
    ptys,
    registry,
    adapter,
    settings: () => settings.get(),
    baseEnv: env,
    bridge: () => ({ token: bridge.token, configFile: bridgeConfigFile }),
    beforeClaudeLaunch: (projectId, root) => changes.snapshotSession(projectId, root),
    onClaudeLaunched: ({ projectId, terminalId, sessionId, mode }) =>
      void events
        .append({
          id: newId(),
          ts: Date.now(),
          projectId,
          agent: 'trellis',
          sessionId,
          promptId: null,
          terminalId,
          kind: 'session.start',
          data: { source: mode === 'continue' ? 'resume' : 'startup', model: null },
        })
        .catch(logFailure('terminal', 'recording the session start failed')),
  })
  terminals = terminalService

  const analyzer = new TurnAnalyzer({
    adapter,
    events,
    changes,
    settings: () => settings.get(),
    git,
    agent: () => terminalService.agentLaunch(),
    onStatus: (projectId, running) => send(Push.analysisStatus, { projectId, running }),
  })
  const rules = new RulesService(git, changes)
  const health = new HealthService(rules, events)
  pipeline = new TurnPipeline({
    events,
    changes,
    analyzer,
    // Runs the project's check command only when the turn can still be sent back (ADR-0027).
    guard: async (project, turnChanges, mayBlock) => {
      const { env } = await terminalService.agentLaunch()
      const lang = project.recordLanguage ?? settings.get().language ?? 'en'
      const verdict = await rules.turnVerdict(project, turnChanges, {
        runCheck: mayBlock,
        env,
        lang,
        // The agent is waiting for the Stop reply; leave room for the rules and the reply.
        checkTimeoutMs: adapter.stopReplyMs - 15_000,
      })
      if (!verdict) return null
      return {
        check: {
          newViolations: verdict.newViolations,
          frozenCount: verdict.frozenCount,
          check: verdict.check,
          blocked: false,
        },
        reason: verdict.reason,
      }
    },
    warm: (project, tree) => rules.warm(project, tree),
    onCheck: (projectId, running) => send(Push.checkStatus, { projectId, running }),
  })

  const ctx: AppContext = {
    rules,
    health,
    dataDir,
    settings,
    registry,
    events,
    bridge,
    adapter,
    ptys,
    terminals: terminalService,
    changes,
    watcher,
    env,
    shellEnvResolved: () => shellEnvResolved,
    git,
    window: () => mainWindow,
  }

  const send = (channel: string, ...args: unknown[]): void => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, ...args)
  }

  events.on('event', (event) => send(Push.event, event))
  ptys.on('data', (message) => send(Push.terminalData, message))
  ptys.on('update', (info) => send(Push.terminalUpdate, info))
  ptys.on('removed', (terminalId) => send(Push.terminalRemoved, terminalId))
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
    if (!isMac()) app.quit()
  })
  app.on('will-quit', () => {
    ptys.disposeAll()
    stopAllChildren()
    watcher.stop()
    void bridge.stop()
  })
}
