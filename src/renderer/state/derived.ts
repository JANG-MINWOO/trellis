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

export function useClaudeTerminal(projectId: string | null): TerminalInfo | null {
  const terminals = useStore((s) => s.terminals)
  return useMemo(
    () =>
      Object.values(terminals).find((t) => t.projectId === projectId && t.kind === 'claude') ??
      null,
    [terminals, projectId],
  )
}

export function useClaudeState(projectId: string | null): ClaudeState {
  const terminal = useClaudeTerminal(projectId)
  const timeline = useTimeline(projectId)
  if (!terminal?.running) return 'off'
  return deriveAgentState(timeline, terminal.sessionId)
}
