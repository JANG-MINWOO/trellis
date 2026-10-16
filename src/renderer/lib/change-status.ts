import type { ChangeStatus } from '@shared/types'

/** Text color of a change letter (A/M/D/R/T). */
export const STATUS_TEXT: Record<ChangeStatus, string> = {
  A: 'text-success',
  M: 'text-warning',
  D: 'text-danger',
  R: 'text-info',
  T: 'text-warning',
}

/** Badge (soft background + text) of a change letter. */
export const STATUS_BADGE: Record<ChangeStatus, string> = {
  A: 'bg-accent-soft text-success',
  M: 'bg-warning-soft text-warning',
  D: 'bg-danger-soft text-danger',
  R: 'bg-info-soft text-info',
  T: 'bg-warning-soft text-warning',
}
