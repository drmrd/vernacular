import { MM_PER_INCH } from '../units/length-units'

/** Two lengths closer than this are the same length. */
export const LENGTH_TOLERANCE_MM = 0.001

/**
 * Two directions closer than this are the same direction; over 100 m it equals one length
 * tolerance.
 */
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

/**
 * Two plan points closer than this are joined: the merge distance of the wall graph and the
 * derivation.
 */
export const JOIN_DISTANCE_MM = 1

/** The distance the wall graph merges nearby endpoints at (core/topology/wall-graph.ts). */
export const DEFAULT_JUNCTION_TOLERANCE_MM = JOIN_DISTANCE_MM

/**
 * The length the derivation compares with; the graph merge distance until the
 * derivation switches to the length tolerance.
 */
export const DERIVATION_LENGTH_TOLERANCE_MM = DEFAULT_JUNCTION_TOLERANCE_MM

/**
 * How closely a room ring follows its walls (core/scene/wall-room-sides.ts); equals the graph
 * merge distance, so every corner of a derived room counts as on the walls it was traced from.
 */
export const ROOM_RING_TOLERANCE_MM = DEFAULT_JUNCTION_TOLERANCE_MM

/**
 * How far a point may lie from a daylight room outline and still count as on it; owned by the
 * daylight work (core/daylight/room-validation.ts). It exists for the floating-point error of plan
 * coordinates: a point interpolated along a wall that is not parallel to an axis is off the exact
 * line by rounding error. The value is far below any real dimension, so it still refuses an end
 * point that is a few millimetres off the wall. The side test in room-geometry.ts probes twice
 * this distance from a span, so a span that the check accepts keeps both of its probes off the
 * outline.
 */
export const OUTLINE_TOLERANCE_MM = 1

/**
 * A cross product below this means two plan segments are parallel (core/geometry/segment.ts,
 * polygon.ts).
 */
export const CROSS_PRODUCT_PARALLEL_LIMIT = 1e-9

/**
 * A ray direction dotted with a plane normal below this means the ray runs along the plane
 * (core/scene/opening-reach.ts).
 */
export const REACH_RAY_PARALLEL_LIMIT = 1e-9

/**
 * A squared length below this is a degenerate segment or edge (core/geometry/segment.ts,
 * polygon.ts).
 */
export const DEGENERATE_SQUARED_LENGTH_MM2 = 1e-9

/**
 * A face with an area at or below this is dropped: a junction core this small has collapsed to a
 * line (core/topology/junction-fill.ts), and the test also drops the negative-area outer
 * (unbounded) face of the half-edge walk (core/topology/rooms.ts).
 */
export const MIN_FACE_AREA_MM2 = 1

/**
 * Two junction fill corners closer than this are the same corner
 * (core/topology/junction-fill.ts).
 */
export const FILL_CORNER_MATCH_MM = 1e-6

/** Two opening void points closer than this are the same point (core/scene/opening-void.ts). */
export const VOID_SAME_POINT_MM = 1e-9

/**
 * Below this distance from a wall, the walker is pushed out along the wall's normal
 * (core/scene/walk-collision.ts).
 */
export const WALK_CONTACT_MM = 1e-6

/**
 * Two front-direction scores, or an outwardness and zero, within this of each other tie; owned
 * by the view-from-the-front work (core/scene/front-direction.ts). Outward normals are computed
 * from wall endpoints, so mirror-image walls can differ in the last bits; this is far below any
 * difference a drawn plan can mean.
 */
export const FRONT_DIRECTION_TIE = 1e-9

/**
 * A void edge whose two ends both lie within this of the wall outline's base, top, or an end
 * counts as on that outline and gets no reveal face (engine/scene/wall-builder.ts).
 */
export const WALL_BOUNDARY_MATCH_MM = 1e-6

/**
 * A wall cap smaller than this area is dropped (engine/scene/wall-prism.ts). A real wall footprint
 * spans many orders of magnitude more area, so this only catches a footprint collapsed to a point
 * or self-intersecting with zero net area, where a cap would draw backward or as a zero-area
 * triangle.
 */
export const CAP_AREA_LIMIT_MM2 = 1e-6

/**
 * A wall face length at or below this is degenerate (core/geometry/wall-face.ts). A run this
 * short has no usable direction, and a stretch this short is a sliver left behind by a gap that
 * lands on an end or on its neighbor rather than a piece of standing wall.
 */
export const WALL_FACE_DEGENERATE_LENGTH_MM = 1e-9

/**
 * A dot product of unit normals within this of -1, 0, or 1 counts as exact; owned by the
 * daylight work (core/daylight/upright-form-factor.ts).
 */
export const UNIT_NORMAL_DOT_LIMIT = 1e-9

/**
 * A ray hit at most this far behind the ground still beats it, so a floor slab coplanar with
 * the lawn wins; owned by the picking work (engine/scene/pick-scene.ts).
 */
export const GROUND_PICK_TIE_MM = 1
