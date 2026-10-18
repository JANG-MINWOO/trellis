// Changes, computed from git (never from hook events).

export type ChangeStatus = 'A' | 'M' | 'D' | 'R' | 'T'
export type Baseline = 'session' | 'head'

export interface ChangeEntry {
  path: string
  oldPath: string | null
  status: ChangeStatus
  additions: number
  deletions: number
  binary: boolean
}

export interface ChangeGroup {
  area: string
  files: ChangeEntry[]
  additions: number
  deletions: number
}

export type ChangeReport =
  | { kind: 'not-repo' }
  | { kind: 'error'; message: string }
  | {
      kind: 'ok'
      baseline: Baseline
      /** When the session baseline is missing we fall back to HEAD and say so. */
      baselineFallback: boolean
      baselineTakenAt: number | null
      branch: string | null
      groups: ChangeGroup[]
      /** Changed since the last commit (like git status), for the file tree's markers. */
      sinceHead: { path: string; status: ChangeStatus }[]
      totals: { files: number; additions: number; deletions: number }
      computedAt: number
    }
