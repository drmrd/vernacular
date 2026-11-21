import { describe, expect, it } from 'vitest'
import {
  MUTATION_NOT_REACHED_NOTE,
  createMutationBudget,
  parseBudgetMinutes,
} from './mutation-budget.mjs'

const MINUTE_MS = 60000

describe('parseBudgetMinutes', () => {
  it('accepts a whole number of minutes greater than 0', () => {
    expect(parseBudgetMinutes('15')).toBe(15)
  })

  it.each([
    ['5', 5],
    ['120', 120],
  ])('accepts %j as %d minutes', (value, minutes) => {
    expect(parseBudgetMinutes(value)).toBe(minutes)
  })

  it.each(['0', '-5', '1.5', '15m', ''])('rejects %j and names the value', (value) => {
    expect(() => parseBudgetMinutes(value)).toThrow(
      `--mutation-budget-minutes needs a whole number of minutes greater than 0, got ${value}`,
    )
  })
})

describe('createMutationBudget', () => {
  it('allows new runs until the spent time reaches the budget', () => {
    const budget = createMutationBudget(1)
    expect(budget.canStart()).toBe(true)
    budget.spend(MINUTE_MS - 1)
    expect(budget.canStart()).toBe(true)
    budget.spend(1)
    expect(budget.canStart()).toBe(false)
  })

  it('always allows a new run without a budget', () => {
    const budget = createMutationBudget(null)
    budget.spend(10 * 60 * MINUTE_MS)
    expect(budget.canStart()).toBe(true)
  })
})

describe('MUTATION_NOT_REACHED_NOTE', () => {
  it('is the exact note text', () => {
    expect(MUTATION_NOT_REACHED_NOTE).toBe('mutation check not reached: the time budget was spent')
  })
})
