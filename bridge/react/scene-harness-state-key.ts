// Orders two property names by their code units: a fixed order that does not depend on the locale.
function compareNames(left: string, right: string): number {
  if (left < right) return -1
  return left > right ? 1 : 0
}

// A JSON replacer that writes every object with its entries in name order, so two objects that
// hold the same entries give the same text however they were built.
function withSortedEntries(_name: string, value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => compareNames(left, right)),
  )
}

/**
 * The text that names one harness state: every prop of the harness view, each object with its
 * entries in a fixed order. The readiness flags of the stage must start again for each state,
 * so the view remounts the stage whenever this text changes. A function or an undefined prop
 * has no text form and drops out, so a callback never counts as part of the state. NaN and an
 * infinite number become null; the harness props hold plain finite data, so no two states collide.
 */
export function harnessStateKey(props: object): string {
  return JSON.stringify(props, withSortedEntries)
}
