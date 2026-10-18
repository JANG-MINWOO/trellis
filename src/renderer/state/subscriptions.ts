// What main pushes (settings, terminals, events, background work, file changes) → the store.
import { EVENT_WINDOW } from '@shared/defaults'
import { appendToWindow } from '@shared/event-window'
import { setLanguage } from '../i18n'
import { api } from '../lib/api'
import { pickTab, useStore } from './store'

/** Events that may have changed files, so the changes panel should look again. */
const TOUCHES_FILES = new Set(['tool.use', 'tool.fail', 'turn.stop', 'turn.changes'])

export function subscribeToMain(): () => void {
  const { setState: set, getState: get } = useStore
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
        if (!list) return {}
        // Same window as a fresh load, so a long session does not grow without bound.
        const next = appendToWindow(list, event, EVENT_WINDOW)
        return { events: { ...s.events, [event.projectId]: next } }
      })
      if (TOUCHES_FILES.has(event.kind)) get().refreshChanges(event.projectId)
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
}
