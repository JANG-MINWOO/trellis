import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { Git } from '../changes'
import { applyBehavior, listSpecs } from './spec-store'

function repo(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'trellis-specs-'))
  execFileSync('git', ['init', '-q'], { cwd: root })
  return root
}

describe('spec store', () => {
  it('adds, changes and links behaviors to tests', async () => {
    const root = repo()
    const first = await applyBehavior(
      root,
      'docs/specs',
      {
        op: 'add',
        kind: 'behavior',
        targetId: null,
        area: 'Login',
        statement: 'WHEN 5 failures, THE SYSTEM SHALL lock the account.',
      },
      'en',
    )
    expect(first).toEqual({ specPath: 'docs/specs/login.md', itemId: 'B-001' })
    // Same area (case-insensitive) goes to the same file; a new area gets its own.
    await applyBehavior(
      root,
      'docs/specs',
      {
        op: 'add',
        kind: 'invariant',
        targetId: null,
        area: 'login',
        statement: 'Passwords are never logged.',
      },
      'en',
    )
    const other = await applyBehavior(
      root,
      'docs/specs',
      {
        op: 'add',
        kind: 'behavior',
        targetId: null,
        area: 'Cart',
        statement: 'WHEN x, THE SYSTEM SHALL y.',
      },
      'en',
    )
    expect(other).toEqual({ specPath: 'docs/specs/cart.md', itemId: 'B-002' })
    const changed = await applyBehavior(
      root,
      'docs/specs',
      {
        op: 'change',
        kind: 'behavior',
        targetId: 'B-001',
        area: 'Whatever',
        statement: 'WHEN 3 failures, THE SYSTEM SHALL lock the account.',
      },
      'en',
    )
    expect(changed.specPath).toBe('docs/specs/login.md')
    expect(readFileSync(path.join(root, 'docs', 'specs', 'login.md'), 'utf8')).toContain(
      '[B-001] WHEN 3 failures',
    )

    mkdirSync(path.join(root, 'tests'))
    writeFileSync(
      path.join(root, 'tests', 'login.test.ts'),
      "it('B-001 locks the account', () => {})\n",
    )
    const list = await listSpecs(root, 'docs/specs', new Git('git', () => process.env), true)
    expect(list.areas.map((a) => [a.area, a.items.map((i) => i.id)])).toEqual([
      ['Cart', ['B-002']],
      ['Login', ['B-001', 'I-001']],
    ])
    expect(list.tests).toEqual({ 'B-001': ['tests/login.test.ts'] })
  })

  it('refuses a folder outside the project', async () => {
    const root = repo()
    await expect(
      applyBehavior(
        root,
        '../x',
        { op: 'add', kind: 'behavior', targetId: null, area: 'A', statement: 's' },
        'en',
      ),
    ).rejects.toThrow()
  })
})
