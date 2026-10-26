import { describe, expect, it } from 'vitest'
import {
  invariantStatements,
  normalizeIntentInput,
  normalizeTaskContinue,
  normalizeTaskDone,
} from './intent'

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

describe('task fields', () => {
  it('keeps an id-like task id and a past start time, drops the rest', () => {
    expect(normalizeIntentInput({ goal: 'g', taskId: 'abc-123', from: 50 }, 100)).toMatchObject({
      taskId: 'abc-123',
      from: 50,
    })
    const bad = normalizeIntentInput({ goal: 'g', taskId: '../x', from: 'soon' }, 100)
    expect(bad.taskId).toBeUndefined()
    expect(bad.from).toBeUndefined()
    expect(normalizeIntentInput({ goal: 'g', from: 500 }, 100).from).toBe(100)
  })

  it('ends a task now unless an earlier moment is given', () => {
    expect(normalizeTaskDone('t1', undefined, 100)).toEqual({ taskId: 't1', at: 100 })
    expect(normalizeTaskDone('t1', 40, 100)).toEqual({ taskId: 't1', at: 40 })
    expect(normalizeTaskDone('t1', 400, 100)).toEqual({ taskId: 't1', at: 100 })
    expect(normalizeTaskDone(7, 40, 100)).toBeNull()
  })

  it('takes a task into a conversation from a past moment at most', () => {
    expect(normalizeTaskContinue('t1', undefined, 100)).toEqual({ taskId: 't1' })
    expect(normalizeTaskContinue('t1', 40, 100)).toEqual({ taskId: 't1', from: 40 })
    expect(normalizeTaskContinue('t1', 400, 100)).toEqual({ taskId: 't1', from: 100 })
    expect(normalizeTaskContinue('../x', 40, 100)).toBeNull()
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
