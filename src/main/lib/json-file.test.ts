import { mkdtempSync, promises as fs, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readJson, writeJsonAtomic } from './json-file'

let dir: string

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('readJson', () => {
  it('returns the fallback for a missing file', async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'trellis-json-'))
    expect(await readJson(path.join(dir, 'none.json'), [])).toEqual([])
  })

  it('keeps a corrupt file aside so the next save cannot overwrite it', async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'trellis-json-'))
    const file = path.join(dir, 'projects.json')
    await fs.writeFile(file, '[{"id": "a"', 'utf8')
    expect(await readJson(file, [])).toEqual([])
    await writeJsonAtomic(file, [])
    const aside = (await fs.readdir(dir)).find((f) => f.startsWith('projects.json.corrupt-'))
    expect(aside).toBeDefined()
    expect(await fs.readFile(path.join(dir, aside!), 'utf8')).toBe('[{"id": "a"')
  })
})

describe('writeJsonAtomic', () => {
  it('keeps the order of writes to the same file', async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'trellis-json-'))
    const file = path.join(dir, 'settings.json')
    await Promise.all([1, 2, 3, 4, 5].map((n) => writeJsonAtomic(file, { n })))
    expect(await readJson(file, null)).toEqual({ n: 5 })
    expect((await fs.readdir(dir)).filter((f) => f.endsWith('.tmp'))).toEqual([])
  })
})
