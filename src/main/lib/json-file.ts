import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { log } from './log'
import { KeyedSerialQueue } from './serial'

/**
 * Returns the fallback when the file does not exist. A file that exists but cannot be parsed is
 * moved aside (`<file>.corrupt-<time>`) first, so the next save cannot overwrite the only copy.
 */
export async function readJson<T>(file: string, fallback: T): Promise<T> {
  let text: string
  try {
    text = await fs.readFile(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback
    throw error
  }
  try {
    return JSON.parse(text) as T
  } catch (error) {
    const aside = `${file}.corrupt-${Date.now()}`
    await fs.rename(file, aside).catch(() => undefined)
    log.error(
      'json-file',
      `unreadable ${path.basename(file)}, kept as ${path.basename(aside)}`,
      error,
    )
    return fallback
  }
}

const writes = new KeyedSerialQueue()

/** Write via a temp file + rename so a crash never leaves a half-written file. */
export function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  const text = JSON.stringify(data, null, 2) + '\n'
  return writes.run(file, async () => {
    await fs.mkdir(path.dirname(file), { recursive: true })
    const tmp = `${file}.${randomUUID()}.tmp`
    await fs.writeFile(tmp, text, 'utf8')
    await fs.rename(tmp, file)
  })
}
