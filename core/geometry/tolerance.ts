import { MM_PER_INCH } from '../units/length-units'

/** Two lengths closer than this are the same length. */
export const LENGTH_TOLERANCE_MM = 0.001

/** Two directions closer than this are the same direction; over 100 m it equals one length tolerance. */
export const ANGLE_TOLERANCE_RAD = 1e-8

const GRID_STEPS_PER_LENGTH_TOLERANCE = 1000

/** Spacing of the grid that derived coordinates round to: a thousandth of the length tolerance. */
export const DERIVED_COORDINATE_GRID_MM = LENGTH_TOLERANCE_MM / GRID_STEPS_PER_LENGTH_TOLERANCE

/**
 * Snap-grid resolution, in units per millimeter, that offset corners round to:
 * the reciprocal of DERIVED_COORDINATE_GRID_MM. Each coordinate is snapped to
 * the nearest 1/SNAP_UNITS_PER_MM of a millimeter.
 * A corner that mixes a zero and a nonzero edge offset comes from a shifted-line
 * intersection that carries IEEE-754 rounding noise far below the junction
 * tolerance, so it can land a fraction of a nanometer off its exact coordinate.
 * Snapping to this sub-micrometer grid clears that noise so abutting geometry
 * meets on exact coordinates, without disturbing any real geometry (ADR-0134).
 */
export const SNAP_UNITS_PER_MM = 1 / DERIVED_COORDINATE_GRID_MM

/**
 * Largest coordinate magnitude the plan supports: there, 10,000 roundings stay
 * a hundred times below the length tolerance.
 */
export const SUPPORTED_EXTENT_MM = 1_000_000

const FINEST_INCH_DENOMINATOR = 256

/** Smallest step an imperial length display shows: a 256th of an inch. */
export const SMALLEST_IMPERIAL_DISPLAY_STEP_MM = MM_PER_INCH / FINEST_INCH_DENOMINATOR

/** Smallest step a metric length display shows. */
export const SMALLEST_METRIC_DISPLAY_STEP_MM = 0.1
