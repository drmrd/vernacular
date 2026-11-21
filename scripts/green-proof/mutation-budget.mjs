/**
 * The time budget that caps check 4: new mutation runs start while the time spent on earlier
 * runs is under the budget, and a run that has started always finishes.
 * @typedef {{ canStart(): boolean, spend(ms: number): void }} MutationBudget
 */

export const MUTATION_NOT_REACHED_NOTE = 'mutation check not reached: the time budget was spent'

const MILLISECONDS_PER_MINUTE = 60000
const WHOLE_MINUTES = /^[1-9]\d*$/

/**
 * @param {string} value
 * @returns {number} a whole number of minutes greater than 0
 */
export function parseBudgetMinutes(value) {
  if (!WHOLE_MINUTES.test(value)) {
    throw new Error(
      `--mutation-budget-minutes needs a whole number of minutes greater than 0, got ${value}`,
    )
  }
  return Number(value)
}

/**
 * @param {number | null} minutes null means no cap
 * @returns {MutationBudget}
 */
export function createMutationBudget(minutes) {
  let spent = 0
  return {
    canStart: () => minutes === null || spent < minutes * MILLISECONDS_PER_MINUTE,
    spend(ms) {
      spent += ms
    },
  }
}
