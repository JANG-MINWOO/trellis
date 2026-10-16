// Derived views over the event ledger, cached per events array so many components can ask cheaply.
import { useMemo } from 'react'
import {
  buildTimeline,
  deriveAgentState,
  type AgentState,
  type TimelineItem,
} from '@shared/timeline'
import type { TerminalInfo, TrellisEvent } from '@shared/types'
import { useStore } from './store'

const EMPTY: TimelineItem[] = []
const cache = new WeakMap<TrellisEvent[], TimelineItem[]>()

export function timelineOf(events: TrellisEvent[] | undefined): TimelineItem[] {
  if (!events) return EMPTY
  let items = cache.get(events)
  if (!items) {
    items = buildTimeline(events)
    cache.set(events, items)
  }
  return items
}

export function useTimeline(projectId: string | null): TimelineItem[] {
  const events = useStore((s) => (projectId ? s.events[projectId] : undefined))
  return timelineOf(events)
}

export type ClaudeState = AgentState | 'off'

/** The Claude tab the user is looking at; otherwise the first one in tab order. */
export function useClaudeTerminal(projectId: string | null): TerminalInfo | null {
  const terminals = useStore((s) => s.terminals)
  const activeTab = useStore((s) => (projectId ? s.activeTab[projectId] : undefined))
  return useMemo(() => {
    const active = activeTab ? terminals[activeTab] : undefined
    if (active?.kind === 'claude' && active.projectId === projectId) return active
    const claude = Object.values(terminals)
      .filter((t) => t.projectId === projectId && t.kind === 'claude')
      .sort((a, b) => a.index - b.index)
    return claude[0] ?? null
  }, [terminals, activeTab, projectId])
}

export function useClaudeState(projectId: string | null): ClaudeState {
  const terminal = useClaudeTerminal(projectId)
  const timeline = useTimeline(projectId)
  if (!terminal?.running) return 'off'
  return deriveAgentState(timeline, terminal.sessionId)
}

/** macOS shows ⌘ shortcuts and "Finder"; the others Ctrl and "Explorer". */
export function useIsMac(): boolean {
  return useStore((s) => s.appInfo?.platform === 'darwin')
}

/** i18n key of the "show in Finder/Explorer" label in a section ('projects' | 'editors'). */
export const revealKey = (section: 'projects' | 'editors', isMac: boolean): string =>
  `${section}.${isMac ? 'revealMac' : 'reveal'}`
