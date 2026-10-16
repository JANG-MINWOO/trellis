import { describe, expect, it } from 'vitest'
import { invariantStatements, normalizeIntentInput } from './intent'

describe('normalizeIntentInput', () => {
  it('builds the text from goal and must-not when none is given', () => {
    expect(
      normalizeIntentInput({
        goal: 'Add login lock',
        mustNot: 'Keep sessions',
        predictedAreas: ['auth', 3],
      }),
    ).toEqual({
      text: 'Add login lock\nKeep sessions',
      goal: 'Add login lock',
      mustNot: 'Keep sessions',
      predictedAreas: ['auth'],
    })
  })

  it('accepts the plain text older versions sent, and bounds long input', () => {
    expect(normalizeIntentInput('just text').text).toBe('just text')
    expect(normalizeIntentInput({ goal: 'x'.repeat(5000) }).goal).toHaveLength(2000)
    expect(normalizeIntentInput(null)).toEqual({
      text: '',
      goal: '',
      mustNot: '',
      predictedAreas: [],
    })
  })
})

describe('invariantStatements', () => {
  it('strips bullets and drops empty lines', () => {
    expect(invariantStatements(['- keep sessions', '* no data loss', '  ', 7, '• a'])).toEqual([
      'keep sessions',
      'no data loss',
      'a',
    ])
    expect(invariantStatements('not a list')).toEqual([])
  })
})
