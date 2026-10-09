import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Project } from '@shared/types'
import { applyTemplates, planTemplates } from './templates'

function project(dir: string): Project {
  return {
    id: 'p',
    name: 'shop',
    path: dir,
    addedAt: 0,
    lastOpenedAt: 0,
    recordLanguage: null,
    decisionsDir: 'docs/decisions',
    specsDir: 'docs/specs',
    analysisEnabled: true,
    riskAreas: [],
    guard: { enforceRules: false, checkCommand: 'npm test' },
  } as unknown as Project
}

describe('templates', () => {
  it('plans by stack and never overwrites', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'trellis-tpl-'))
    writeFileSync(path.join(dir, 'package.json'), '{}')
    writeFileSync(path.join(dir, 'CLAUDE.md'), 'mine\n')
    const plan = await planTemplates(project(dir), 'ko')
    expect(plan.stack).toBe('node')
    expect(plan.files.map((f) => [f.path, f.exists])).toEqual([
      ['.trellis/rules.json', false],
      ['AGENTS.md', true],
      ['CLAUDE.md', true],
      ['docs/decisions/README.md', false],
      ['docs/specs/README.md', false],
    ])
    const written = await applyTemplates(
      project(dir),
      'ko',
      plan.files.map((f) => f.path),
    )
    expect(written).toEqual([
      '.trellis/rules.json',
      'docs/decisions/README.md',
      'docs/specs/README.md',
    ])
    expect(readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8')).toBe('mine\n')
    expect(
      JSON.parse(readFileSync(path.join(dir, '.trellis', 'rules.json'), 'utf8')).maxLines,
    ).toBe(300)
    expect(await applyTemplates(project(dir), 'ko', ['.trellis/rules.json'])).toEqual([])
  })

  it('creates AGENTS.md with a CLAUDE.md import when neither exists', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'trellis-tpl-'))
    writeFileSync(path.join(dir, 'project.godot'), '')
    const written = await applyTemplates(project(dir), 'en', ['AGENTS.md', 'CLAUDE.md'])
    expect(written).toEqual(['AGENTS.md', 'CLAUDE.md'])
    expect(readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8')).toBe('@AGENTS.md\n')
    expect(readFileSync(path.join(dir, 'AGENTS.md'), 'utf8')).toContain(
      'Pass `npm test` before finishing.',
    )
  })
})
