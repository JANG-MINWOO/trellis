import { api } from '../../lib/api'
import type { ChangesSlice, Slice } from '../types'

/** Bursts of file events (an agent editing) become one refresh. */
const DEBOUNCE_MS = 700
const timers = new Map<string, number>()
/** Latest request per project; an older reply that arrives late is dropped. */
const latest = new Map<string, number>()

export const createChangesSlice: Slice<ChangesSlice> = (set, get) => ({
  changes: {},
  changesLoading: {},
  baseline: 'session',

  refreshChanges(projectId, immediate = false) {
    const run = async (): Promise<void> => {
      timers.delete(projectId)
      const seq = (latest.get(projectId) ?? 0) + 1
      latest.set(projectId, seq)
      set((s) => ({ changesLoading: { ...s.changesLoading, [projectId]: true } }))
      const report = await api.changes.get(projectId, get().baseline)
      if (latest.get(projectId) !== seq) return
      set((s) => ({
        changes: { ...s.changes, [projectId]: report },
        changesLoading: { ...s.changesLoading, [projectId]: false },
      }))
    }
    const pending = timers.get(projectId)
    if (pending) window.clearTimeout(pending)
    if (immediate) void run()
    else
      timers.set(
        projectId,
        window.setTimeout(() => void run(), DEBOUNCE_MS),
      )
  },

  setBaseline(baseline) {
    set({ baseline })
    const id = get().activeProjectId
    if (id) get().refreshChanges(id, true)
  },
})
