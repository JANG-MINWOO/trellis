// Error log for the main process (ADR-0031). Background work (hooks, analysis, checks) has no one
// to show an error to, so it lands here instead of disappearing. Local only, like the ledgers.
import { promises as fs } from 'node:fs'
import path from 'node:path'

const MAX_BYTES = 1024 * 1024

let file: string | null = null
let tail: Promise<void> = Promise.resolve()

/** Starts writing to <dir>/main.log; the previous log is kept as main.1.log once it is large. */
export async function initLog(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
  const target = path.join(dir, 'main.log')
  const size = await fs.stat(target).then(
    (s) => s.size,
    () => 0,
  )
  if (size > MAX_BYTES) await fs.rename(target, path.join(dir, 'main.1.log')).catch(() => undefined)
  file = target
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.stack ?? `${error.name}: ${error.message}`
  return String(error)
}

function write(level: 'error' | 'warn', scope: string, message: string, error?: unknown): void {
  const line = `${new Date().toISOString()} ${level} [${scope}] ${message}${
    error === undefined ? '' : ` — ${describe(error)}`
  }\n`
  process.stderr.write(line)
  const target = file
  if (!target) return
  tail = tail.then(() => fs.appendFile(target, line, 'utf8')).catch(() => undefined)
}

export const log = {
  error: (scope: string, message: string, error?: unknown): void =>
    write('error', scope, message, error),
  warn: (scope: string, message: string, error?: unknown): void =>
    write('warn', scope, message, error),
}

/** For promises nobody awaits: record the failure instead of swallowing it. */
export const logFailure =
  (scope: string, message: string) =>
  (error: unknown): undefined => {
    log.error(scope, message, error)
    return undefined
  }
