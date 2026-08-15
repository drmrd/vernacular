import type { Point } from '../model/types'

import { lineIntersection } from './segment'
import { dot, leftPerp, shift, subtract, unit } from './vector'

/**
 * Lengths at or below this many millimeters count as zero. A run this short has no
 * usable direction, and a stretch this short is a sliver left behind by a gap that
 * lands on an end or on its neighbor rather than a piece of standing wall.
 */
const DEGENERATE_LENGTH_MM = 1e-9

/**
 * The four already-mitred plan corners of one wall run, two at each end. `aPlus`
 * and `bPlus` sit on the run's `+normal` side, `aMinus` and `bMinus` on its
 * `-normal` side, where the normal is the left-hand normal of the direction
 * `start -> end`. This is structurally the `WallFootprint` that `wallFootprints`
 * produces, taken as an input so face geometry stays below wall topology.
 */
export interface WallFaceCorners {
  /** `+normal` side corner at the run's start. */
  aPlus: Point
  /** `-normal` side corner at the run's start. */
  aMinus: Point
  /** `+normal` side corner at the run's end. */
  bPlus: Point
  /** `-normal` side corner at the run's end. */
  bMinus: Point
}

/**
 * A clear span cut out of a run, as centerline distances in millimeters measured
 * from the run's `start`. An opening (door, window, cased passage) contributes one.
 */
export interface WallFaceGap {
  from: number
  to: number
}

/**
 * One solid stretch of wall drawn in plan: the two face lines a plan drawing
 * strokes as cut lines, and the closed poche ring filled between them. The poche
 * traces the plus face from the stretch's start to its end, then the minus face
 * back, so its four corners wind consistently and carry no repeated closing point.
 * Both faces of a returned stretch stand and run the same way along the run, so the
 * ring stays a simple quadrilateral that a fill routine can paint.
 */
export interface WallFaceStretch {
  plusFace: readonly [Point, Point]
  minusFace: readonly [Point, Point]
  poche: readonly [Point, Point, Point, Point]
}

/**
 * One wall run to draw: its centerline endpoints, its mitred corners, and the clear
 * spans that openings cut out of it. Omitting `gaps` leaves the run solid.
 */
export interface WallFaceRun {
  start: Point
  end: Point
  corners: WallFaceCorners
  gaps?: readonly WallFaceGap[]
}

/** A solid stretch as centerline distances from the run's start, `from` below `to`. */
interface SolidSpan {
  from: number
  to: number
}

/** The centerline of one run: where it starts, which way it runs, and how long it is. */
interface CenterlineFrame {
  origin: Point
  along: Point
  length: number
}

/**
 * How far along the run axis a face line reaches, measured from the run's `start`
 * the same way a gap's distances are. A miter slides a face's corner along the axis,
 * so this is the face's own reach and not the run's `[0, length]`.
 */
interface FaceExtent {
  from: number
  to: number
}

/** One face line of a run, with the centerline frame needed to cut it. */
interface FaceCut extends CenterlineFrame {
  face: readonly [Point, Point]
  extent: FaceExtent
}

/** The plus and minus face lines of one run, ready to cut. */
interface RunFaces {
  plus: FaceCut
  minus: FaceCut
}

/**
 * The plan symbology of one wall run: a face pair and a poche ring per solid
 * stretch, in order from the run's start. A run with no gaps yields a single
 * stretch spanning the whole run; each gap splits the run further, and a gap that
 * swallows an end or the whole run drops the stretches it leaves empty. A stretch
 * that a miter has pinched down to one standing face goes with them: the ring holds
 * four corners, so it cannot carry the triangle left where one face runs out before
 * the stretch does.
 *
 * The corners are passed through untouched wherever a stretch reaches an end of the
 * run, rather than recomputed from the centerline and a half-thickness. The corners
 * arrive already mitred against the neighboring runs, and only the exact incoming
 * points tile the joint; a recomputed square offset would leave the miters open.
 */
export function wallFaceGeometry(run: WallFaceRun): WallFaceStretch[] {
  const axis = subtract(run.end, run.start)
  const runLength = Math.hypot(axis.x, axis.y)
  if (runLength <= DEGENERATE_LENGTH_MM) return []

  const frame: CenterlineFrame = { origin: run.start, along: unit(axis), length: runLength }
  const faces: RunFaces = {
    plus: faceCut(frame, [run.corners.aPlus, run.corners.bPlus]),
    minus: faceCut(frame, [run.corners.aMinus, run.corners.bMinus]),
  }
  return solidSpans(runLength, run.gaps ?? [])
    .map((span) => stretchFor(faces, span))
    .filter(hasTwoStandingFaces)
}

/** One face line paired with `frame`, carrying where its own corners fall on the axis. */
function faceCut(frame: CenterlineFrame, face: readonly [Point, Point]): FaceCut {
  return {
    ...frame,
    face,
    extent: { from: distanceAlongAxis(frame, face[0]), to: distanceAlongAxis(frame, face[1]) },
  }
}

/** How far along the run axis `point` sits, measured from the frame's origin. */
function distanceAlongAxis(frame: CenterlineFrame, point: Point): number {
  return dot(subtract(point, frame.origin), frame.along)
}

/**
 * True while both faces of `stretch` still stand. A stretch pressed up against an
 * acute miter can lose one of them: the miter takes that face's corner back past the
 * stretch, so the face cuts down to a point and the material left is a triangle
 * rather than the quadrilateral a poche ring can hold.
 */
function hasTwoStandingFaces(stretch: WallFaceStretch): boolean {
  return (
    faceLength(stretch.plusFace) > DEGENERATE_LENGTH_MM &&
    faceLength(stretch.minusFace) > DEGENERATE_LENGTH_MM
  )
}

/** How long one cut face line is. */
function faceLength(face: readonly [Point, Point]): number {
  const endToEnd = subtract(face[1], face[0])
  return Math.hypot(endToEnd.x, endToEnd.y)
}

/** The face pair and poche ring of one solid span. */
function stretchFor(faces: RunFaces, span: SolidSpan): WallFaceStretch {
  const plusFace: readonly [Point, Point] = [
    facePointAt(faces.plus, span.from),
    facePointAt(faces.plus, span.to),
  ]
  const minusFace: readonly [Point, Point] = [
    facePointAt(faces.minus, span.from),
    facePointAt(faces.minus, span.to),
  ]
  return {
    plusFace,
    minusFace,
    poche: [plusFace[0], plusFace[1], minusFace[1], minusFace[0]],
  }
}

/**
 * The point on `cut`'s face line at centerline distance `distanceAlong`, found by
 * crossing the face line with the perpendicular through that centerline point, so
 * the plus and minus cuts of one gap sit at the same distance and the cut reads as
 * square to the wall. A mitred face line is still parallel to the centerline at the
 * half-thickness offset (mitring slides its corners along it without tilting it),
 * so the crossing is exact and no half-thickness has to be recovered here. Distances
 * at either end return the incoming corner itself, keeping mitred joints closed.
 *
 * In between, the distance is held inside this face's own extent rather than inside
 * the run's length. A miter pulls one face's corner back along the axis and pushes
 * the other's past the run end, so the two faces cover different stretches of the
 * axis and only the face's own reach says where its material stops. Clamped to the
 * run's length instead, a cut standing past a pulled-back corner would land beyond
 * the end of that face, turning it back on itself against its partner and folding
 * the poche into a bow tie. Clamped to the face's own reach it lands on the corner,
 * which is where the wall really is pinched out on the inside of an acute turn.
 */
function facePointAt(cut: FaceCut, distanceAlong: number): Point {
  if (distanceAlong <= 0) return cut.face[0]
  if (distanceAlong >= cut.length) return cut.face[1]

  const onFace = clampToExtent(distanceAlong, cut.extent)
  const centerlinePoint = shift(cut.origin, cut.along, onFace)
  const crossing = lineIntersection(cut.face[0], cut.along, centerlinePoint, leftPerp(cut.along))
  // A direction and its own perpendicular never run parallel, so the crossing
  // always exists; the fallback only satisfies the nullable return type.
  return crossing ?? centerlinePoint
}

/** `distanceAlong` held inside the stretch of axis one face line actually covers. */
function clampToExtent(distanceAlong: number, extent: FaceExtent): number {
  return Math.min(Math.max(distanceAlong, extent.from), extent.to)
}

/** The solid material left between the run's gaps, dropping degenerate stretches. */
function solidSpans(runLength: number, gaps: readonly WallFaceGap[]): SolidSpan[] {
  const spans: SolidSpan[] = []
  let cursor = 0
  for (const gap of normalizedGaps(runLength, gaps)) {
    recordSpan(spans, { from: cursor, to: gap.from })
    cursor = gap.to
  }
  recordSpan(spans, { from: cursor, to: runLength })
  return spans
}

/** Keeps `span` unless it is degenerate, as a gap meeting an end or a neighbor is. */
function recordSpan(spans: SolidSpan[], span: SolidSpan): void {
  if (span.to - span.from > DEGENERATE_LENGTH_MM) spans.push(span)
}

/**
 * The run's gaps clamped to the run, each ordered low to high, sorted by start, and
 * merged where they overlap or touch, so walking them start to end yields the solid
 * spans in one pass.
 */
function normalizedGaps(runLength: number, gaps: readonly WallFaceGap[]): WallFaceGap[] {
  const ordered = gaps
    .map((gap) => ({
      from: clampToRun(Math.min(gap.from, gap.to), runLength),
      to: clampToRun(Math.max(gap.from, gap.to), runLength),
    }))
    .sort((left, right) => left.from - right.from)
  return mergeOverlapping(ordered)
}

/** `distanceAlong` held inside `[0, runLength]`. */
function clampToRun(distanceAlong: number, runLength: number): number {
  return Math.min(Math.max(distanceAlong, 0), runLength)
}

/** Folds gaps that overlap or touch into one, given gaps already sorted by start. */
function mergeOverlapping(gaps: readonly WallFaceGap[]): WallFaceGap[] {
  const merged: WallFaceGap[] = []
  for (const gap of gaps) {
    const previous = merged.at(-1)
    if (previous !== undefined && gap.from <= previous.to) {
      previous.to = Math.max(previous.to, gap.to)
      continue
    }
    merged.push({ ...gap })
  }
  return merged
}
