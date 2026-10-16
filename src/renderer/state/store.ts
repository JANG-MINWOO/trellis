// The renderer's one store, assembled from slices (ADR-0032). Slices may call each other through
// get(): selecting a project loads its events, refreshes its changes and may start Claude.
import { create } from 'zustand'
import type { ProjectView } from '@shared/types'
import { createAppSlice } from './slices/app'
import { createChangesSlice } from './slices/changes'
import { createLedgerSlice, createProjectsSlice } from './slices/projects'
import { createTerminalsSlice } from './slices/terminals'
import { createUiSlice } from './slices/ui'
import type { StoreState } from './types'

export { pickTab, tabOrder } from './slices/terminals'
export type { RightTab, SettingsSection, StartOptions, Toast } from './types'

export const useStore = create<StoreState>()((...a) => ({
  ...createAppSlice(...a),
  ...createProjectsSlice(...a),
  ...createLedgerSlice(...a),
  ...createTerminalsSlice(...a),
  ...createChangesSlice(...a),
  ...createUiSlice(...a),
}))

/** Convenience selector that returns a stable reference. */
export const useActiveProject = (): ProjectView | null =>
  useStore((s) => s.projects.find((p) => p.id === s.activeProjectId) ?? null)
