import { describe, expect, it } from 'vitest'
import { dirPrefix, joinRel } from './rel-path'

describe('joinRel', () => {
  it('joins with one slash whatever the folder looks like', () => {
    expect(joinRel('docs/specs', 'auth.md')).toBe('docs/specs/auth.md')
    expect(joinRel('docs/specs/', 'auth.md')).toBe('docs/specs/auth.md')
    expect(joinRel('', 'README.md')).toBe('README.md')
  })
})

describe('dirPrefix', () => {
  it('ends with a slash, or is null for an unset folder', () => {
    expect(dirPrefix('docs/specs')).toBe('docs/specs/')
    expect(dirPrefix('docs/specs//')).toBe('docs/specs/')
    expect(dirPrefix('')).toBeNull()
  })
})
