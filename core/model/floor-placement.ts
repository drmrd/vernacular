// Default naming and elevation placement for floors added to a project. Keeps the
// "above-ground floors read upward as ordinals, basements read downward" policy in
// one pure module so the command layer and the editor share a single source of truth.

const ORDINAL_SUFFIX_OTHER = 'th'
// Suffix by units digit: index 0 and 4 through 9 fall back to "th", so only the
// first four entries differ. Indexed access yields the right suffix directly.
const ORDINAL_SUFFIXES = [ORDINAL_SUFFIX_OTHER, 'st', 'nd', 'rd']
const TEEN_REMAINDER_START = 11
const TEEN_REMAINDER_END = 13
const ORDINAL_TENS_MODULUS = 100
const ORDINAL_UNITS_MODULUS = 10

// English ordinals carry "st", "nd", "rd" by last digit, except the eleven-through
// thirteen teens (and their hundreds repeats), which always take "th".
export function ordinalLabel(value: number): string {
  const withinHundred = value % ORDINAL_TENS_MODULUS
  if (withinHundred >= TEEN_REMAINDER_START && withinHundred <= TEEN_REMAINDER_END) {
    return `${value}${ORDINAL_SUFFIX_OTHER}`
  }
  const suffix = ORDINAL_SUFFIXES[value % ORDINAL_UNITS_MODULUS] ?? ORDINAL_SUFFIX_OTHER
  return `${value}${suffix}`
}
