import { describe, expect, it } from 'vitest'
import { combineChanges, parseNameStatusZ, parseNumstatZ } from './git-parse'

describe('parseNumstatZ', () => {
  it('reads plain, binary and renamed entries', () => {
    const out = '3\t1\tsrc/a.ts\0-\t-\timg.png\0' + '2\t0\t\0old/b.ts\0new/b.ts\0'
    const stats = parseNumstatZ(out)
    expect(stats.get('src/a.ts')).toEqual({ additions: 3, deletions: 1, binary: false })
    expect(stats.get('img.png')).toEqual({ additions: 0, deletions: 0, binary: true })
    expect(stats.get('new/b.ts')).toEqual({ additions: 2, deletions: 0, binary: false })
  })

  it('handles tabs and unicode in file names', () => {
    const stats = parseNumstatZ('1\t0\t문서/결정 기록.md\0')
    expect(stats.get('문서/결정 기록.md')?.additions).toBe(1)
  })
})

describe('parseNameStatusZ', () => {
  it('reads statuses including renames', () => {
    expect(parseNameStatusZ('M\0src/a.ts\0A\0b.ts\0D\0c.ts\0R087\0old.ts\0new.ts\0')).toEqual([
      { status: 'M', path: 'src/a.ts', oldPath: null },
      { status: 'A', path: 'b.ts', oldPath: null },
      { status: 'D', path: 'c.ts', oldPath: null },
      { status: 'R', path: 'new.ts', oldPath: 'old.ts' },
    ])
  })
})

describe('combineChanges', () => {
  it('limits to the project prefix and strips it', () => {
    const entries = combineChanges(
      'M\0app/src/a.ts\0M\0other/x.ts\0',
      '4\t2\tapp/src/a.ts\0' + '1\t1\tother/x.ts\0',
      'app',
    )
    expect(entries).toEqual([
      { path: 'src/a.ts', oldPath: null, status: 'M', additions: 4, deletions: 2, binary: false },
    ])
  })
})
