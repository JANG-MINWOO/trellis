import { app, dialog, ipcMain, shell } from 'electron'
import { Invoke, Send } from '@shared/ipc'
import { translate } from '@shared/i18n'
import type {
  Baseline,
  Language,
  Project,
  ProjectPatch,
  SettingsPatch,
  TerminalStartRequest,
  TrellisEvent,
} from '@shared/types'
import type { AppContext } from './context'
import { applyTemplates, planTemplates } from './features/templates'
import { registerIntentIpc } from './ipc-intent'
import { listDecisionDocs } from './features/decisions'
import { openInEditor } from './features/editor'
import { checkEnvironment } from './features/environment'
import { listDirectory } from './features/files'
import { newId } from './lib/ids'
import { detectEditors } from './platform/editors'
import { currentPlatform } from './platform/os'
import { resolveInsideProject } from './platform/paths'

const asString = (v: unknown): string => (typeof v === 'string' ? v : '')

export function registerIpc(ctx: AppContext): void {
  registerIntentIpc(ctx)
  const project = (id: unknown) => {
    const p = ctx.registry.get(asString(id))
    if (!p) throw new Error(`Unknown project: ${String(id)}`)
    return p
  }
  const handle = (channel: string, fn: (...args: unknown[]) => unknown): void => {
    ipcMain.handle(channel, (_event, ...args) => fn(...args))
  }

  handle(Invoke.appInfo, () => ({
    version: app.getVersion(),
    build: __TRELLIS_BUILD__,
    platform: currentPlatform(),
    isDev: !app.isPackaged,
    locale: app.getLocale(),
  }))

  handle(Invoke.settingsGet, () => ctx.settings.get())
  handle(Invoke.settingsUpdate, (patch) => ctx.settings.update((patch ?? {}) as SettingsPatch))

  handle(Invoke.envCheck, async () =>
    checkEnvironment(ctx.settings.get(), await ctx.env(), ctx.shellEnvResolved()),
  )

  handle(Invoke.projectsList, () => ctx.registry.list())
  handle(Invoke.projectsAddDialog, async () => {
    const picked = process.env.TRELLIS_E2E_PICK_FOLDER
    let folder = picked
    if (!folder) {
      const win = ctx.window()
      const lang = ctx.settings.get().language ?? 'en'
      const options = {
        title: translate(lang, 'dialog.openFolder'),
        properties: ['openDirectory', 'createDirectory'] as const,
      }
      const result = win
        ? await dialog.showOpenDialog(win, { ...options, properties: [...options.properties] })
        : await dialog.showOpenDialog({ ...options, properties: [...options.properties] })
      if (result.canceled || !result.filePaths[0]) return null
      folder = result.filePaths[0]
    }
    return ctx.registry.add(folder)
  })
  handle(Invoke.projectsRemove, async (id) => {
    const p = project(id)
    for (const t of ctx.ptys.list()) if (t.projectId === p.id) ctx.ptys.dispose(t.id)
    await ctx.registry.remove(p.id)
  })
  handle(Invoke.projectsUpdate, (id, patch) =>
    ctx.registry.update(project(id).id, (patch ?? {}) as ProjectPatch),
  )
  handle(Invoke.projectsOpened, async (id) => {
    const p = project(id)
    await ctx.registry.markOpened(p.id)
    if (ctx.settings.get().lastProjectId !== p.id)
      await ctx.settings.update({ lastProjectId: p.id })
  })
  handle(Invoke.projectsReveal, async (id, rel) => {
    const p = project(id)
    const target = rel ? resolveInsideProject(p.path, asString(rel)) : null
    if (target) shell.showItemInFolder(target)
    else await shell.openPath(p.path)
  })
  handle(Invoke.watchProject, (id) => {
    const p = id ? ctx.registry.get(asString(id)) : undefined
    ctx.watcher.watch(p?.id ?? null, p?.path ?? null)
  })

  handle(Invoke.filesList, async (id, relDir) => {
    const p = project(id)
    const inRepo = (await ctx.changes.repoInfo(p.path)) !== null
    return listDirectory(p.path, asString(relDir), await ctx.git(), inRepo)
  })

  handle(Invoke.editorList, async () => detectEditors(await ctx.env()))
  handle(Invoke.editorOpen, async (id, rel) =>
    openInEditor(project(id).path, asString(rel), ctx.settings.get(), await ctx.env()),
  )

  handle(Invoke.terminalStart, (req) => ctx.terminals.start(req as TerminalStartRequest))
  handle(Invoke.terminalKill, (terminalId) => ctx.ptys.kill(asString(terminalId)))
  handle(Invoke.terminalClose, (terminalId) => ctx.ptys.dispose(asString(terminalId)))
  handle(Invoke.terminalList, () => ctx.ptys.list())
  handle(Invoke.terminalAttach, (terminalId) => ctx.ptys.attach(asString(terminalId)))
  ipcMain.on(Send.terminalWrite, (_e, terminalId: unknown, data: unknown) => {
    if (typeof data === 'string') ctx.ptys.write(asString(terminalId), data)
  })
  ipcMain.on(Send.terminalPasteImage, (_e, terminalId: unknown) => {
    const id = asString(terminalId)
    const keys =
      ctx.ptys.get(id)?.kind === 'claude' ? ctx.adapter.imagePasteKeys(process.platform) : null
    if (keys) ctx.ptys.write(id, keys)
  })
  ipcMain.on(Send.terminalResize, (_e, terminalId: unknown, cols: unknown, rows: unknown) => {
    if (typeof cols === 'number' && typeof rows === 'number')
      ctx.ptys.resize(asString(terminalId), Math.floor(cols), Math.floor(rows))
  })

  handle(Invoke.eventsList, (id, limit) =>
    ctx.events.list(project(id).id, typeof limit === 'number' ? limit : 2000),
  )
  handle(Invoke.intentSave, async (id, input) => {
    const p = project(id)
    const raw = (typeof input === 'string' ? { text: input } : (input ?? {})) as Record<
      string,
      unknown
    >
    const goal = asString(raw.goal).slice(0, 2000)
    const mustNot = asString(raw.mustNot).slice(0, 2000)
    const predictedAreas = (Array.isArray(raw.predictedAreas) ? raw.predictedAreas : [])
      .map(asString)
      .filter(Boolean)
      .slice(0, 30)
    const text = asString(raw.text).slice(0, 4000) || [goal, mustNot].filter(Boolean).join('\n')
    const event: TrellisEvent = {
      id: newId(),
      ts: Date.now(),
      projectId: p.id,
      agent: 'trellis',
      sessionId: null,
      promptId: null,
      terminalId: null,
      kind: 'intent.set',
      data: { text, goal, mustNot, predictedAreas },
    }
    await ctx.events.append(event)
    return event
  })

  handle(Invoke.changesGet, (id, baseline) => {
    const p = project(id)
    return ctx.changes.get(p.id, p.path, baseline === 'head' ? 'head' : ('session' as Baseline))
  })
  handle(Invoke.changesResetBaseline, (id) => {
    const p = project(id)
    return ctx.changes.snapshotSession(p.id, p.path)
  })
  handle(Invoke.gitInit, (id) => ctx.changes.initRepo(project(id).path))

  handle(Invoke.decisionsList, (id) => {
    const p = project(id)
    return listDecisionDocs(p.path, p.decisionsDir)
  })
  handle(Invoke.healthGet, (id) => ctx.health.get(project(id)))
  handle(Invoke.rulesFreezeBaseline, (id) => ctx.rules.freezeBaseline(project(id)))
  const recordLang = (p: Project): Language =>
    p.recordLanguage ?? ctx.settings.get().language ?? 'en'
  handle(Invoke.templatesPlan, (id) => {
    const p = project(id)
    return planTemplates(p, recordLang(p))
  })
  handle(Invoke.templatesApply, async (id, paths) => {
    const p = project(id)
    const list = Array.isArray(paths) ? paths.map(asString) : []
    return { written: await applyTemplates(p, recordLang(p), list) }
  })
}
