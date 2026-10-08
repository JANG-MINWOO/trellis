import { describe, expect, it } from 'vitest'
import { parseArgs } from './cli-args'

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
