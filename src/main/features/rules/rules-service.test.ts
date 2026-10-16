import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Project } from '@shared/types'
import { Git } from '../../lib/git'
import { ChangesService } from '../changes'
import { RulesService } from './rules-service'

function setup() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'trellis-rules-'))
  const git = (...args: string[]): void =>
    void execFileSync('git', args, { cwd: root, stdio: 'ignore' })
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 't@example.com')
  git('config', 'user.name', 't')
  const write = (rel: string, text: string): void => {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    writeFileSync(path.join(root, rel), text)
  }
  write('.trellis/rules.json', '{"maxLines": 20}')
  write('src/old-long.ts', 'export const x = 1\n'.repeat(30))
  write('src/a.ts', 'export const a = 1\n')
  write('README.md', 'See `src/a.ts`.\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'init')
  const gitRunner = new Git('git', () => process.env)
  const changes = new ChangesService(
    async () => gitRunner,
    mkdtempSync(path.join(os.tmpdir(), 'trellis-rules-data-')),
  )
  const project = {
    id: 'p',
    name: 'p',
    path: root,
    specsDir: 'docs/specs',
    guard: { enforceRules: true, checkCommand: '' },
  } as unknown as Project
  return { root, write, changes, rules: new RulesService(async () => gitRunner, changes), project }
}

describe('RulesService', () => {
  it('judges a turn by what it introduced, with the rules from its start', async () => {
    const { root, write, changes, rules, project } = setup()
    await changes.beginTurn('p', root, 't1')
    write('src/a.ts', "import { b } from './b'\nexport const a = 1\n")
    write('src/b.ts', "import { a } from './a'\nexport const b = 2\n")
    write('src/new-long.ts', 'export const y = 2\n'.repeat(25))
    // Loosening the rules inside the turn does not change the verdict.
    write('.trellis/rules.json', '{"maxLines": 1000, "cycles": false}')
    const turn = (await changes.turnChanges('p', root, 't1', false))!
    const verdict = (await rules.turnVerdict(
      { ...project, guard: { enforceRules: true, checkCommand: 'node -e "process.exit(3)"' } },
      turn,
      {
        runCheck: true,
        env: process.env as Record<string, string>,
        lang: 'en',
      },
    ))!
    expect(verdict.newViolations.map((v) => v.fingerprint).sort()).toEqual([
      'cycle:src/a.ts|src/b.ts',
      'max-lines:src/new-long.ts',
    ])
    expect(verdict.frozenCount).toBe(1)
    expect(verdict.check?.ok).toBe(false)
    expect(verdict.reason).toContain('src/new-long.ts: 25 lines (limit 20)')
    expect(verdict.reason).toContain('Import cycle: src/a.ts → src/b.ts')
    expect(verdict.reason).toContain('The check command `node -e "process.exit(3)"` failed')
  })

  it('freezes the baseline and reports only what came after', async () => {
    const { root, write, rules, project } = setup()
    expect(rules.report(await rules.current(project)).newViolations).toHaveLength(1)
    expect(await rules.freezeBaseline(project)).toBe(1)
    expect(
      JSON.parse(readFileSync(path.join(root, '.trellis', 'baseline.json'), 'utf8')).fingerprints,
    ).toEqual(['max-lines:src/old-long.ts'])
    write('src/another.ts', 'export const z = 3\n'.repeat(22))
    const report = rules.report(await rules.current(project))
    expect(report).toMatchObject({ hasConfig: true, hasBaseline: true, frozenCount: 1 })
    expect(report.newViolations.map((v) => v.path)).toEqual(['src/another.ts'])
  })

  it('works on a folder without git', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'trellis-rules-plain-'))
    writeFileSync(path.join(dir, 'big.py'), 'x = 1\n'.repeat(500))
    const changes = new ChangesService(
      async () => new Git('git', () => process.env),
      mkdtempSync(path.join(os.tmpdir(), 'd-')),
    )
    const rules = new RulesService(async () => null, changes)
    const result = await rules.current({ id: 'q', path: dir, specsDir: '' } as unknown as Project)
    expect(result.analysis.violations.map((v) => v.fingerprint)).toEqual(['max-lines:big.py'])
  })
})
