// Intent input from the intent card. It goes into the ledger, so it is bounded and typed here.
import type { IntentData } from './types'

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** Older versions sent the intent as one plain string. */
export function normalizeIntentInput(input: unknown): IntentData {
  const raw = (
    typeof input === 'string' ? { text: input } : input && typeof input === 'object' ? input : {}
  ) as Record<string, unknown>
  const goal = str(raw.goal).slice(0, 2000)
  const mustNot = str(raw.mustNot).slice(0, 2000)
  const predictedAreas = (Array.isArray(raw.predictedAreas) ? raw.predictedAreas : [])
    .map(str)
    .filter(Boolean)
    .slice(0, 30)
  const text = str(raw.text).slice(0, 4000) || [goal, mustNot].filter(Boolean).join('\n')
  return { text, goal, mustNot, predictedAreas }
}

/** "- must not drop users" lines of an intent → statements for invariant candidates. */
export function invariantStatements(lines: unknown): string[] {
  return (Array.isArray(lines) ? lines : [])
    .map((line) =>
      str(line)
        .replace(/^[-*•]\s*/, '')
        .trim(),
    )
    .filter(Boolean)
    .slice(0, 20)
}
