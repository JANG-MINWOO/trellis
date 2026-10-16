import { api } from '../../lib/api'
import type { LedgerSlice, ProjectsSlice, Slice } from '../types'

const without = <T>(record: Record<string, T>, id: string): Record<string, T> => {
  const next = { ...record }
  delete next[id]
  return next
}

export const createProjectsSlice: Slice<ProjectsSlice> = (set, get) => ({
  projects: [],
  activeProjectId: null,

  async refreshProjects() {
    set({ projects: await api.projects.list() })
  },

  async selectProject(id) {
    set({ activeProjectId: id })
    // The user may pick another project while we wait; then this one must not go on (or start
    // Claude in a project that is no longer on screen).
    const stillActive = (): boolean => get().activeProjectId === id
    await api.projects.watch(id)
    if (!id || !stillActive()) return
    const project = get().projects.find((p) => p.id === id)
    if (!project || project.missing) return
    await api.projects.markOpened(id)
    await Promise.all([get().loadEvents(id), get().refreshProjects()])
    if (!stillActive()) return
    get().refreshChanges(id, true)
    const settings = get().settings
    const hasClaude = Object.values(get().terminals).some(
      (t) => t.projectId === id && t.kind === 'claude',
    )
    // 'ask' leaves the launch card up so permissions and continue/new are a conscious choice.
    if (settings?.claude.onProjectOpen === 'start' && !hasClaude) {
      await get().startTerminal(id, 'claude')
    }
  },

  async addProject() {
    const project = await api.projects.addViaDialog()
    if (!project) return
    await get().refreshProjects()
    await get().selectProject(project.id)
  },

  async removeProject(id) {
    await api.projects.remove(id)
    set((s) => ({
      terminals: Object.fromEntries(
        Object.entries(s.terminals).filter(([, t]) => t.projectId !== id),
      ),
      events: without(s.events, id),
      changes: without(s.changes, id),
      changesLoading: without(s.changesLoading, id),
      startErrors: without(s.startErrors, id),
      activeTab: without(s.activeTab, id),
      activeProjectId: s.activeProjectId === id ? null : s.activeProjectId,
    }))
    await get().refreshProjects()
  },
})

export const createLedgerSlice: Slice<LedgerSlice> = (set) => ({
  events: {},
  analyzing: {},
  checking: {},
  fsTick: {},

  async loadEvents(projectId) {
    const events = await api.events.list(projectId)
    set((s) => ({ events: { ...s.events, [projectId]: events } }))
  },
})
