import { app } from 'electron'
import { Invoke } from '@shared/ipc'
import type { SettingsPatch } from '@shared/types'
import type { AppContext } from '../context'
import { openInEditor } from '../features/editor'
import { checkEnvironment } from '../features/environment'
import { detectEditors } from '../platform/editors'
import { currentPlatform } from '../platform/os'
import { asString, handle, projectOf } from './common'

export function registerAppIpc(ctx: AppContext): void {
  handle(Invoke.appInfo, () => ({
    version: app.getVersion(),
    build: __TRELLIS_BUILD__,
    platform: currentPlatform(),
    isDev: !app.isPackaged,
    locale: app.getLocale(),
  }))

  handle(Invoke.settingsGet, () => ctx.settings.get())
  // applySettingsPatch normalizes every field, so a malformed patch cannot break the settings.
  handle(Invoke.settingsUpdate, (patch) => ctx.settings.update((patch ?? {}) as SettingsPatch))

  handle(Invoke.envCheck, async () => {
    const { executable, env } = await ctx.terminals.agentLaunch()
    return checkEnvironment(executable, env, ctx.shellEnvResolved())
  })

  handle(Invoke.editorList, async () => detectEditors(await ctx.env()))
  handle(Invoke.editorOpen, async (id, rel) =>
    openInEditor(projectOf(ctx, id).path, asString(rel), ctx.settings.get(), await ctx.env()),
  )
}
