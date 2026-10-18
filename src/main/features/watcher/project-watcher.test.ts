import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { isRelevantChange } from './project-watcher'

describe('isRelevantChange', () => {
  it('reports project files but not dependency folders', () => {
    expect(isRelevantChange(path.join('src', 'a.ts'))).toBe(true)
    expect(isRelevantChange(path.join('node_modules', 'x', 'index.js'))).toBe(false)
  })

  it('inside .git, reports only what moves HEAD or the index', () => {
    expect(isRelevantChange(path.join('.git', 'index'))).toBe(true)
    expect(isRelevantChange(path.join('.git', 'HEAD'))).toBe(true)
    // `git reset --soft` moves the branch without touching the index.
    expect(isRelevantChange(path.join('.git', 'refs', 'heads', 'main'))).toBe(true)
    expect(isRelevantChange(path.join('.git', 'refs', 'heads', 'feature', 'x'))).toBe(true)
    expect(isRelevantChange(path.join('.git', 'packed-refs'))).toBe(true)
    expect(isRelevantChange(path.join('.git', 'objects', 'ab', 'cdef'))).toBe(false)
    expect(isRelevantChange(path.join('.git', 'refs', 'remotes', 'origin', 'main'))).toBe(false)
    expect(isRelevantChange(path.join('.git', 'logs', 'HEAD'))).toBe(false)
  })
})
