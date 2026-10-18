// The app keeps only recent events in memory (EVENT_WINDOW). Intent events stay regardless: a task
// can outlive the window, and its intent must not vanish with it (ADR-0034).
import type { TrellisEvent } from './types'

export const isPinnedEvent = (e: TrellisEvent): boolean => e.kind.startsWith('intent.')

/** The same test on a raw ledger line, so older lines are parsed only when they are kept. */
export const isPinnedLine = (line: string): boolean => line.includes('"kind":"intent.')

/** Appends an event; once the window is full, the oldest event that is not pinned goes. */
export function appendToWindow(
  list: readonly TrellisEvent[],
  event: TrellisEvent,
  limit: number,
): TrellisEvent[] {
  if (list.length < limit) return [...list, event]
  const drop = list.findIndex((e) => !isPinnedEvent(e))
  return drop < 0 ? [...list, event] : [...list.slice(0, drop), ...list.slice(drop + 1), event]
}
