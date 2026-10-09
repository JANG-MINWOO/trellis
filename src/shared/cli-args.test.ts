import { describe, expect, it } from 'vitest'
import { parseArgs, quotePathForTerminal } from './cli-args'

describe('parseArgs', () => {
  it.each([
    ['', []],
    ['   ', []],
    ['--model opus', ['--model', 'opus']],
    ['--append-system-prompt "be brief please"', ['--append-system-prompt', 'be brief please']],
    ["--x 'single quoted' y", ['--x', 'single quoted', 'y']],
    ['--empty ""', ['--empty', '']],
    ['a\\b', ['a\\b']],
    ['"say \\"hi\\""', ['say "hi"']],
  ])('%j', (input, expected) => {
    expect(parseArgs(input)).toEqual(expected)
  })
})

describe('quotePathForTerminal', () => {
  it('escapes like a macOS terminal and quotes on Windows', () => {
    expect(quotePathForTerminal('/Users/me/스크린샷 2026-10-09 (1).png', 'darwin')).toBe(
      '/Users/me/스크린샷\\ 2026-10-09\\ \\(1\\).png',
    )
    expect(quotePathForTerminal('/tmp/plain.png', 'linux')).toBe('/tmp/plain.png')
    expect(quotePathForTerminal('C:\\Users\\me\\My Pics\\a.png', 'win32')).toBe(
      '"C:\\Users\\me\\My Pics\\a.png"',
    )
    expect(quotePathForTerminal('C:\\a.png', 'win32')).toBe('C:\\a.png')
  })
})
