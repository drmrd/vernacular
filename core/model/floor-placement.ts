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

// Default storey rise (finished-floor to finished-floor) for a freshly added
// floor. Users adjust it afterward through setFloorElevation; this only seeds a
// sensible, well-ordered default.
export const DEFAULT_FLOOR_TO_FLOOR_MM = 3000
const GROUND_ELEVATION_MM = 0
const FLOOR_NAME_SUFFIX = ' Floor'

/** The default name and elevation a newly added floor should take. */
export interface PlannedFloor {
  name: string
  elevation: number
}

function countAtOrAboveGround(elevations: readonly number[]): number {
  return elevations.filter((elevation) => elevation >= GROUND_ELEVATION_MM).length
}

// An empty stack sits one storey below ground so the first added upper floor
// lands exactly at ground level (0).
function highestElevation(elevations: readonly number[]): number {
  return elevations.length === 0
    ? GROUND_ELEVATION_MM - DEFAULT_FLOOR_TO_FLOOR_MM
    : Math.max(...elevations)
}

// Above-ground floors number upward from the ground: with only a ground floor
// present the next one is the "2nd Floor", and it stacks one storey higher.
export function planUpperFloor(elevations: readonly number[]): PlannedFloor {
  const ordinal = ordinalLabel(countAtOrAboveGround(elevations) + 1)
  return {
    name: `${ordinal}${FLOOR_NAME_SUFFIX}`,
    elevation: highestElevation(elevations) + DEFAULT_FLOOR_TO_FLOOR_MM,
  }
}

const BASEMENT_NAME = 'Basement'
const SUBTERRANEAN_PREFIX = 'Sub-'
const DEEPER_PREFIX = 'sub-'
const BASEMENT_WORD = 'basement'

// The first level below ground is the "Basement"; each deeper level prepends a
// further "Sub-", giving "Sub-basement", "Sub-sub-basement", and so on.
export function defaultBasementName(depth: number): string {
  if (depth <= 1) {
    return BASEMENT_NAME
  }
  return `${SUBTERRANEAN_PREFIX}${DEEPER_PREFIX.repeat(depth - 2)}${BASEMENT_WORD}`
}

function countBelowGround(elevations: readonly number[]): number {
  return elevations.filter((elevation) => elevation < GROUND_ELEVATION_MM).length
}

function lowestElevation(elevations: readonly number[]): number {
  return elevations.length === 0 ? GROUND_ELEVATION_MM : Math.min(...elevations)
}

// Basements descend from the ground: the first sits one storey below the lowest
// existing floor at a negative elevation, keeping above/below ordering by sign.
export function planBasement(elevations: readonly number[]): PlannedFloor {
  return {
    name: defaultBasementName(countBelowGround(elevations) + 1),
    elevation: lowestElevation(elevations) - DEFAULT_FLOOR_TO_FLOOR_MM,
  }
}
