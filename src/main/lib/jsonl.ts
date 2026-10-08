import { promises as fs } from 'node:fs'
import path from 'node:path'

export async function appendJsonl(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.appendFile(file, JSON.stringify(value) + '\n', 'utf8')
}

/** Reads the last `limit` valid records. Corrupt lines are skipped, never fatal. */
export async function readJsonlTail<T>(file: string, limit: number): Promise<T[]> {
  let text: string
  try {
    text = await fs.readFile(file, 'utf8')
  } catch {
    return []
  }
  const lines = text.split('\n')
  const out: T[] = []
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    const line = lines[i]!.trim()
    if (!line) continue
    try {
      out.push(JSON.parse(line) as T)
    } catch {
      // A torn write from a crash; skip it.
    }
  }
  return out.reverse()
}
