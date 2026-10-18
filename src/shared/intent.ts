// Intent input from the intent card. It goes into the ledger, so it is bounded and typed here.
import type { IntentData, TaskDone } from './types'

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
/** Task ids are UUIDs made by main; anything id-like is accepted, nothing else. */
export const normalizeTaskId = (v: unknown): string | null =>
  typeof v === 'string' && /^[\w-]{1,64}$/.test(v) ? v : null
/** A past moment (or now); never in the future. */
const timeOf = (v: unknown, now: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(v, now) : null

/** Older versions sent the intent as one plain string. */
export function normalizeIntentInput(input: unknown, now = Date.now()): IntentData {
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
  const out: IntentData = { text, goal, mustNot, predictedAreas }
  const taskId = normalizeTaskId(raw.taskId)
  const from = timeOf(raw.from, now)
  if (taskId) out.taskId = taskId
  if (from) out.from = from
  return out
}

/** "This task is finished" from the renderer; `at` defaults to now. Null when the id is bad. */
export function normalizeTaskDone(taskId: unknown, at: unknown, now = Date.now()): TaskDone | null {
  const id = normalizeTaskId(taskId)
  return id ? { taskId: id, at: timeOf(at, now) ?? now } : null
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
