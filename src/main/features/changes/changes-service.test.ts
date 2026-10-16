// Integration test against real git repositories in a temp folder (runs on macOS and Windows CI).
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ChangeReport } from '@shared/types'
import { ChangesService } from './changes-service'
import { Git } from '../../lib/git'

const git = new Git('git', () => process.env)
const dirs: string[] = []

function tempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

function repo(): string {
  const dir = tempDir('trellis-changes-')
  const run = (...args: string[]): void => {
    execFileSync('git', args, { cwd: dir, stdio: 'ignore' })
  }
  run('init', '-q', '-b', 'main')
  run('config', 'user.email', 't@example.com')
  run('config', 'user.name', 't')
  run('config', 'core.autocrlf', 'false')
  mkdirSync(path.join(dir, 'app', 'src'), { recursive: true })
  writeFileSync(path.join(dir, 'README.md'), '# r\n')
  writeFileSync(path.join(dir, 'app', 'src', 'a.ts'), 'one\ntwo\n')
  writeFileSync(path.join(dir, '.gitignore'), 'ignored/\n')
  run('add', '-A')
  run('commit', '-q', '-m', 'init')
  return dir
}

function files(report: ChangeReport): string[] {
  if (report.kind !== 'ok') throw new Error(`unexpected report ${report.kind}`)
  return report.groups.flatMap((g) => g.files.map((f) => `${f.status} ${f.path}`)).sort()
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('ChangesService', () => {
  it('reports changes since the session baseline, including untracked files', async () => {
    const root = repo()
    const service = new ChangesService(async () => git, tempDir('trellis-data-'))
    writeFileSync(path.join(root, 'before.txt'), 'made before the session\n')
    await service.snapshotSession('p', root)

    writeFileSync(path.join(root, 'app', 'src', 'a.ts'), 'one\ntwo\nthree\n')
    writeFileSync(path.join(root, 'app', 'src', 'new.ts'), 'x\n')
    mkdirSync(path.join(root, 'ignored'))
    writeFileSync(path.join(root, 'ignored', 'skip.txt'), 'nope\n')

    const session = await service.get('p', root, 'session')
    expect(files(session)).toEqual(['A app/src/new.ts', 'M app/src/a.ts'])
    if (session.kind === 'ok') {
      expect(session.baselineFallback).toBe(false)
      expect(session.totals.additions).toBe(2)
      expect(session.branch).toBe('main')
    }

    const head = await service.get('p', root, 'head')
    expect(files(head)).toEqual(['A app/src/new.ts', 'A before.txt', 'M app/src/a.ts'])

    // The user's index and working tree are untouched.
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' })
    expect(status).toContain('?? app/src/new.ts')
    expect(
      execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: root, encoding: 'utf8' }),
    ).toBe('')
  })

  it('ignores a baseline left over from an earlier app run', async () => {
    const root = repo()
    const data = tempDir('trellis-data-')
    await new ChangesService(async () => git, data).snapshotSession('p', root)
    writeFileSync(path.join(root, 'README.md'), '# changed after the old run\n')
    // Trellis restarts: the new run has not started Claude yet.
    const restarted = new ChangesService(async () => git, data, Date.now() + 1000)
    const report = await restarted.get('p', root, 'session')
    expect(report.kind === 'ok' && report.baselineFallback).toBe(true)
    expect(files(report)).toEqual(['M README.md'])
  })

  it('falls back to HEAD when there is no session baseline', async () => {
    const root = repo()
    const service = new ChangesService(async () => git, tempDir('trellis-data-'))
    writeFileSync(path.join(root, 'README.md'), '# changed\n')
    const report = await service.get('p', root, 'session')
    expect(report.kind === 'ok' && report.baselineFallback).toBe(true)
    expect(files(report)).toEqual(['M README.md'])
  })

  it('scopes a project inside a larger repository and strips the prefix', async () => {
    const root = repo()
    const project = path.join(root, 'app')
    const service = new ChangesService(async () => git, tempDir('trellis-data-'))
    writeFileSync(path.join(root, 'README.md'), 'outside the project\n')
    writeFileSync(path.join(project, 'src', 'a.ts'), 'changed\n')
    expect(files(await service.get('p', project, 'head'))).toEqual(['M src/a.ts'])
  })

  it('attributes changes to a turn, including files written by shell commands', async () => {
    const root = repo()
    const service = new ChangesService(async () => git, tempDir('trellis-data-'))
    writeFileSync(path.join(root, 'README.md'), 'changed before the turn\n')
    await service.beginTurn('p', root, 'prompt-1')
    writeFileSync(path.join(root, 'app', 'src', 'a.ts'), 'edited in the turn\n')
    execFileSync('git', ['add', '-A'], { cwd: root })
    execFileSync('git', ['commit', '-q', '-m', 'claude committed mid-turn'], { cwd: root })
    writeFileSync(path.join(root, 'notes.md'), 'appended by a shell command\n')
    const turn = await service.turnChanges('p', root, 'prompt-1', true)
    expect(turn?.files.map((f) => `${f.status} ${f.path}`).sort()).toEqual([
      'A notes.md',
      'M app/src/a.ts',
    ])
    expect(await service.turnChanges('p', root, 'prompt-1', true)).toBeNull()
  })

  it('says so when the folder is not a repository', async () => {
    const service = new ChangesService(async () => git, tempDir('trellis-data-'))
    expect((await service.get('p', tempDir('trellis-plain-'), 'head')).kind).toBe('not-repo')
  })
})
