import { detectLanguage } from '@shared/i18n'
import { setLanguage } from '../../i18n'
import { api } from '../../lib/api'
import type { AppSlice, Slice } from '../types'

export const createAppSlice: Slice<AppSlice> = (set, get) => ({
  booted: false,
  isDark: true,
  appInfo: null,
  settings: null,

  async boot() {
    const [appInfo, settings, projects, terminals] = await Promise.all([
      api.app.info(),
      api.settings.get(),
      api.projects.list(),
      api.terminal.list(),
    ])
    setLanguage(settings.language ?? detectLanguage(appInfo.locale))
    // The subscriptions start first, so updates that arrived while booting are newer than this list.
    set((s) => ({
      appInfo,
      settings,
      projects,
      terminals: { ...Object.fromEntries(terminals.map((t) => [t.id, t])), ...s.terminals },
      booted: true,
    }))
    const last =
      settings.lastProjectId && projects.find((p) => p.id === settings.lastProjectId && !p.missing)
    if (last) await get().selectProject(last.id)
  },

  async updateSettings(patch) {
    const settings = await api.settings.update(patch)
    if (settings.language) setLanguage(settings.language)
    set({ settings })
  },
})
