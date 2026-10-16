import { dialog, shell } from 'electron'
import { Invoke } from '@shared/ipc'
import { translate } from '@shared/i18n'
import { normalizeProjectPatch, recordLanguageOf, uiLanguage } from '@shared/settings'
import type { AppContext } from '../context'
import { listDirectory, projectAreas } from '../features/files'
import { applyTemplates, planTemplates } from '../features/templates'
import { resolveInsideProject } from '../platform/paths'
import { asString, handle, projectOf } from './common'

/** Project list, files, changes and structure health. */
export function registerProjectIpc(ctx: AppContext): void {
  const project = (id: unknown) => projectOf(ctx, id)
  const inRepo = async (root: string): Promise<boolean> =>
    (await ctx.changes.repoInfo(root)) !== null

  handle(Invoke.projectsList, () => ctx.registry.list())
  handle(Invoke.projectsAddDialog, async () => {
    let folder = process.env.TRELLIS_E2E_PICK_FOLDER
    if (!folder) {
      const win = ctx.window()
      const options = {
        title: translate(uiLanguage(ctx.settings.get()), 'dialog.openFolder'),
        properties: ['openDirectory' as const, 'createDirectory' as const],
      }
      const result = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options)
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
    ctx.registry.update(project(id).id, normalizeProjectPatch(patch)),
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
  handle(Invoke.projectAreas, async (id) => projectAreas(await ctx.git(), project(id).path))

  handle(Invoke.filesList, async (id, relDir) => {
    const p = project(id)
    return listDirectory(p.path, asString(relDir), await ctx.git(), await inRepo(p.path))
  })

  handle(Invoke.changesGet, (id, baseline) => {
    const p = project(id)
    return ctx.changes.get(p.id, p.path, baseline === 'head' ? 'head' : 'session')
  })
  handle(Invoke.changesResetBaseline, (id) => {
    const p = project(id)
    return ctx.changes.snapshotSession(p.id, p.path)
  })
  handle(Invoke.gitInit, (id) => ctx.changes.initRepo(project(id).path))

  handle(Invoke.healthGet, (id) => ctx.health.get(project(id)))
  handle(Invoke.rulesFreezeBaseline, (id) => ctx.rules.freezeBaseline(project(id)))
  handle(Invoke.templatesPlan, (id) => {
    const p = project(id)
    return planTemplates(p, recordLanguageOf(p, ctx.settings.get()))
  })
  handle(Invoke.templatesApply, async (id, paths) => {
    const p = project(id)
    const list = Array.isArray(paths) ? paths.map(asString) : []
    return { written: await applyTemplates(p, recordLanguageOf(p, ctx.settings.get()), list) }
  })
}
