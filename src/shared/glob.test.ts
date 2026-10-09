import { describe, expect, it } from 'vitest'
import { matchesAny, matchesGlob } from './glob'

describe('matchesGlob', () => {
  it.each([
    ['src/auth/login.ts', '**/auth/**', true],
    ['auth/login.ts', '**/auth/**', true],
    ['src/author.ts', '**/auth/**', false],
    ['src/oauth.ts', '**/*auth*.*', true],
    ['db/migrations/001.sql', '**/migrations/**', true],
    ['schema.sql', '**/*.sql', true],
    ['.github/workflows/build.yml', '.github/workflows/**', true],
    ['src/main/a.ts', 'src/main/*', true],
    ['src/main/x/a.ts', 'src/main/*', false],
    ['src/renderer/features/x.tsx', 'src/renderer/**', true],
    ['Dockerfile', '**/Dockerfile', true],
    ['config/.env.local', '**/.env*', true],
    ['a.b', 'a?b', true],
  ])('%s vs %s → %s', (path, glob, expected) => {
    expect(matchesGlob(path, glob)).toBe(expected)
  })

  it('matches any of several globs', () => {
    expect(matchesAny('src/payments/charge.ts', ['**/auth/**', '**/payment*/**'])).toBe(true)
    expect(matchesAny('src/ui.ts', ['**/auth/**'])).toBe(false)
  })
})
