import type { TerminalInfo } from '@shared/types'
import { api } from '../../lib/api'
import type { Slice, TerminalsSlice } from '../types'

const DEFAULT_SIZE = { cols: 100, rows: 30 }

/** Tab order within a project: Claude tabs first, then shells, each by position. */
export const tabOrder = (a: TerminalInfo, b: TerminalInfo): number =>
  a.kind === b.kind ? a.index - b.index : a.kind === 'claude' ? -1 : 1

/** The tab to show for a project when none is chosen. */
export function pickTab(terminals: TerminalInfo[], projectId: string): string | null {
  return terminals.filter((t) => t.projectId === projectId).sort(tabOrder)[0]?.id ?? null
}

export const createTerminalsSlice: Slice<TerminalsSlice> = (set, get) => ({
  terminals: {},
  activeTab: {},
  startErrors: {},

  async startTerminal(projectId, kind, options = {}) {
    if (kind === 'claude')
      set((s) => ({ startErrors: { ...s.startErrors, [projectId]: undefined } }))
    const result = await api.terminal.start({ projectId, kind, ...options, ...DEFAULT_SIZE })
    if (result.ok) {
      set((s) => ({
        terminals: { ...s.terminals, [result.terminal.id]: result.terminal },
        activeTab: { ...s.activeTab, [projectId]: result.terminal.id },
      }))
    } else if (kind === 'claude') {
      set((s) => ({ startErrors: { ...s.startErrors, [projectId]: result } }))
    } else {
      get().toast('error', result.message)
    }
  },

  setActiveTab(projectId, terminalId) {
    set((s) => ({ activeTab: { ...s.activeTab, [projectId]: terminalId } }))
  },

  async closeTerminal(terminalId) {
    await api.terminal.close(terminalId)
  },
})
