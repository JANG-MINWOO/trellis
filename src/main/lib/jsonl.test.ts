import { mkdtempSync, promises as fs, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readJsonlTail } from './jsonl'

let dir: string

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('readJsonlTail', () => {
  it('reads the last records, skips torn lines and keeps older lines the caller asks for', async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'trellis-jsonl-'))
    const file = path.join(dir, 'events.jsonl')
    const lines = [
      '{"n":1,"pin":true}',
      '{"n":2}',
      '{"n":3,"pin":true',
      '{"n":4}',
      '{"n":5}',
      '{"n":6}',
    ]
    await fs.writeFile(file, lines.join('\n') + '\n', 'utf8')
    expect(await readJsonlTail(file, 2)).toEqual([{ n: 5 }, { n: 6 }])
    const pinned = (line: string): boolean => line.includes('"pin"')
    expect(await readJsonlTail(file, 2, pinned)).toEqual([{ n: 1, pin: true }, { n: 5 }, { n: 6 }])
    expect(await readJsonlTail(path.join(dir, 'none.jsonl'), 5)).toEqual([])
  })
})
