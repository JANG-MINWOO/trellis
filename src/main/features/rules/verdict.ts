// Which violations a turn introduced, and how to tell the agent (ADR-0027).
import { translate } from '@shared/i18n'
import { violationText } from '@shared/rules'
import type { Language, Violation } from '@shared/types'

/** Over-limit files and folders that grew noticeably count as new even if they were already over. */
function grew(before: Violation, after: Violation): boolean {
  if (before.size === undefined || after.size === undefined) return false
  const minStep = after.rule === 'folder-size' ? 3 : 10
  return after.size - before.size >= minStep && after.size >= before.size * 1.1
}

/** Violations at the end of a turn that were not there at its start (nor frozen in the baseline). */
export function introducedViolations(
  start: readonly Violation[],
  end: readonly Violation[],
  baseline: ReadonlySet<string> | null,
): Violation[] {
  const before = new Map(start.map((v) => [v.fingerprint, v]))
  return end.filter((v) => {
    const old = before.get(v.fingerprint)
    if (old) return grew(old, v)
    return !baseline?.has(v.fingerprint)
  })
}

/** One line per violation, in the project's language (also used by the guard's reason). */
export function describeViolation(v: Violation, lang: Language): string {
  const { key, vars } = violationText(v)
  return translate(lang, key, vars)
}

export function guardReason(
  violations: readonly Violation[],
  check: { command: string; ok: boolean; output: string } | null,
  lang: Language,
): string | null {
  const failed = check && !check.ok
  if (violations.length === 0 && !failed) return null
  const lines = [translate(lang, 'guard.intro')]
  for (const v of violations.slice(0, 20)) lines.push(`- ${describeViolation(v, lang)}`)
  if (violations.length > 20)
    lines.push(translate(lang, 'guard.more', { count: violations.length - 20 }))
  if (failed) {
    lines.push(
      '',
      translate(lang, 'guard.checkFailed', { command: check.command }),
      check.output.slice(-3000),
    )
  }
  return lines.join('\n')
}
