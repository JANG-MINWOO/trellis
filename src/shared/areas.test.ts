import { describe, expect, it } from 'vitest'
import { areaOf, groupByArea, ROOT_AREA } from './areas'
import type { ChangeEntry } from './types'

describe('areaOf', () => {
  it.each([
    ['README.md', ROOT_AREA],
    ['docs/decisions/0001.md', 'docs'],
    ['scripts/game.gd', 'scripts'],
    ['src/main/features/terminal/pty.ts', 'src/main/features/terminal'],
    ['src/renderer/features/timeline/TurnCard.tsx', 'src/renderer/features/timeline'],
    ['src/shared/types.ts', 'src/shared'],
    ['src/index.ts', 'src'],
    ['packages/core/src/a.ts', 'packages/core'],
    [
      'src/main/java/com/sparta/chairingproject/domain/common/entity/Timestamped.java',
      'src/main/java/com/sparta/chairingproject/domain/common',
    ],
  ])('%s → %s', (path, area) => {
    expect(areaOf(path)).toBe(area)
  })
})

describe('groupByArea', () => {
  const entry = (path: string, additions = 1, deletions = 0): ChangeEntry => ({
    path,
    oldPath: null,
    status: 'M',
    additions,
    deletions,
    binary: false,
  })

  it('sums lines per area and puts root files last', () => {
    const groups = groupByArea([
      entry('README.md', 2),
      entry('src/shared/b.ts', 3, 1),
      entry('src/shared/a.ts', 1, 1),
      entry('docs/x.md', 4),
    ])
    expect(groups.map((g) => g.area)).toEqual(['docs', 'src/shared', ROOT_AREA])
    const shared = groups[1]!
    expect(shared.additions).toBe(4)
    expect(shared.deletions).toBe(2)
    expect(shared.files.map((f) => f.path)).toEqual(['src/shared/a.ts', 'src/shared/b.ts'])
  })
})
