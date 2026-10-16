// The end-of-turn guard (ADR-0027): what the turn broke, in the shape the turn pipeline records.
import type { Language, Project, RulesCheck } from '@shared/types'
import type { TurnChanges } from '../changes'
import type { RulesService } from './rules-service'

export interface GuardVerdict {
  check: RulesCheck
  /** Text sent back to the agent when the turn is blocked. */
  reason: string | null
}

export type Guard = (
  project: Project,
  changes: TurnChanges,
  /** The turn can still be sent back; only then the project's check command runs. */
  mayBlock: boolean,
) => Promise<GuardVerdict | null>

export function createGuard(
  rules: RulesService,
  options: {
    env: () => Promise<Record<string, string>>
    lang: (project: Project) => Language
    /** The agent waits for the reply; the check command must finish well before that. */
    checkTimeoutMs: number
  },
): Guard {
  return async (project, changes, mayBlock) => {
    const verdict = await rules.turnVerdict(project, changes, {
      runCheck: mayBlock,
      env: await options.env(),
      lang: options.lang(project),
      checkTimeoutMs: options.checkTimeoutMs,
    })
    if (!verdict) return null
    return {
      check: {
        newViolations: verdict.newViolations,
        frozenCount: verdict.frozenCount,
        check: verdict.check,
        blocked: false,
      },
      reason: verdict.reason,
    }
  }
}
