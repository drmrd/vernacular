/* eslint-disable max-lines -- one describe block per drawPlan layer; the suite grows as the plan gains layers (openings here) */
import { describe, it, expect } from 'vitest'
import {
  drawEndpointHandles,
  drawGrid,
  drawMarquee,
  drawOpeningResizeHandles,
  drawPlan,
  drawRoomLabel,
  drawRulers,
} from './draw-plan'
import { recordingContext, rectangleRoom, sampleWall as wall } from './draw-plan-test-fixtures'
import { labelBox, labelsOverlap } from './label-layout'
import { PLAN_INK_WIDTH } from './plan-ink'
import { DEFAULT_PLAN_PALETTE, type PlanPalette } from './plan-palette'
import { RULER_THICKNESS_PX } from './ruler'
import type { DrawableOpening } from './draw-opening'
import type { DrawableDimension } from './draw-dimension'
import type { DrawableFurniture } from './draw-furniture'
import { DEFAULT_PLAN_SCALE, worldToScreen, type ScreenPoint } from './viewport'
import { computeFitViewport, contentBounds, planContentPoints, type Bounds } from './fit'
import {
  DEFAULT_METRIC_PREFERENCES,
  colorFromHex,
  createFurnitureInstance,
  effectiveWallThickness,
  solidTreatment,
} from '../../core'
import type {
  DimensionSceneNode,
  OpeningSceneNode,
  Point,
  RoomSceneNode,
  StairSceneNode,
  WallSceneNode,
} from '../../core'

/** A minimal valid `drawPlan` options object that tests override per case. */
function planOptions(overrides: Partial<Parameters<typeof drawPlan>[1]> = {}) {
  return {
    walls: [wall],
    viewport: { scale: DEFAULT_PLAN_SCALE },
    width: 800,
    height: 600,
    selectedIds: new Set<string>(),
    ...overrides,
  }
}

// The viewport every wall-symbology expectation projects through: the same one
// `planOptions` hands drawPlan, with the world origin on the screen origin.
const PLAN_VIEWPORT = { scale: DEFAULT_PLAN_SCALE }

/** A line in screen space, as the two points it runs between. */
type ScreenLine = readonly [ScreenPoint, ScreenPoint]

/**
 * The sample wall's face line `offsetMm` from its centerline, in screen space.
 *
 * The wall runs along +x, so its left-hand normal points +y: the `+normal` face sits
 * half a thickness north of the centerline and the `-normal` face the same distance
 * south. It is free-standing, so both ends are square and each face spans the run.
 */
function sampleWallFace(offsetMm: number): ScreenLine {
  return [
    worldToScreen({ x: wall.start.x, y: wall.start.y + offsetMm }, PLAN_VIEWPORT),
    worldToScreen({ x: wall.end.x, y: wall.end.y + offsetMm }, PLAN_VIEWPORT),
  ]
}

const HALF_SAMPLE_THICKNESS = wall.thickness / 2
const PLUS_FACE = sampleWallFace(HALF_SAMPLE_THICKNESS)
const MINUS_FACE = sampleWallFace(-HALF_SAMPLE_THICKNESS)
const CENTERLINE = sampleWallFace(0)

type PlanRecorder = ReturnType<typeof recordingContext>
type RecordedSegment = PlanRecorder['segments'][number]

// Screen coordinates are world millimeters times a fractional scale, so they are
// compared within a tolerance: the vector form of toBeCloseTo.
const SCREEN_TOLERANCE_PX = 1e-6

function samePoint(recorded: readonly [number, number], point: ScreenPoint): boolean {
  return (
    Math.abs(recorded[0] - point.x) < SCREEN_TOLERANCE_PX &&
    Math.abs(recorded[1] - point.y) < SCREEN_TOLERANCE_PX
  )
}

/** Whether `segment` runs between `line`'s endpoints, in either direction. */
function runsAlong(segment: RecordedSegment, line: ScreenLine): boolean {
  return (
    (samePoint(segment.from, line[0]) && samePoint(segment.to, line[1])) ||
    (samePoint(segment.from, line[1]) && samePoint(segment.to, line[0]))
  )
}

/** The stroke styles of every recorded segment drawn along `line`. */
function stylesAlong(recorder: PlanRecorder, line: ScreenLine): string[] {
  return recorder.segments
    .filter((segment) => runsAlong(segment, line))
    .map((segment) => segment.style)
}

/** The fills painted in the poche neutral, one per solid stretch of wall. */
function pocheFills(recorder: PlanRecorder): string[] {
  return recorder.fills.filter((fill) => fill === DEFAULT_PLAN_PALETTE.poche)
}

describe('drawPlan', () => {
  it('clears the surface and draws each wall as poche filled between two face lines', () => {
    const recorder = recordingContext()

    drawPlan(recorder.ctx, planOptions())

    expect(recorder.clearCount()).toBe(1)
    // One solid wall reads as one filled cut cavity bounded by its two face lines,
    // each stroked in the wall ink at its half-thickness offset from the centerline.
    expect(pocheFills(recorder)).toHaveLength(1)
    expect(stylesAlong(recorder, PLUS_FACE)).toContain(DEFAULT_PLAN_PALETTE.wall)
    expect(stylesAlong(recorder, MINUS_FACE)).toContain(DEFAULT_PLAN_PALETTE.wall)
  })

  it('strokes the faces of a selected wall in the selection color and those of an unselected wall in the wall color', () => {
    const unselected = recordingContext()
    drawPlan(unselected.ctx, planOptions())

    const selected = recordingContext()
    drawPlan(selected.ctx, planOptions({ selectedIds: new Set(['wall:a']) }))

    // Selection swaps the ink of the cut lines themselves, so both faces change color.
    for (const face of [PLUS_FACE, MINUS_FACE]) {
      expect(stylesAlong(unselected, face)).toContain(DEFAULT_PLAN_PALETTE.wall)
      expect(stylesAlong(unselected, face)).not.toContain(DEFAULT_PLAN_PALETTE.selection)
      expect(stylesAlong(selected, face)).toContain(DEFAULT_PLAN_PALETTE.selection)
    }
  })

  it('draws a preview guide line and a start marker when a preview segment is provided', () => {
    const recorder = recordingContext()
    const viewport = { scale: DEFAULT_PLAN_SCALE }
    const preview = { start: { x: 1000, y: 2000 }, end: { x: 5000, y: 2000 } }

    drawPlan(recorder.ctx, {
      walls: [wall],
      viewport,
      width: 800,
      height: 600,
      selectedIds: new Set(),
      preview,
    })

    const wallSegment = recorder.segments[0]
    const previewSegment = recorder.segments[recorder.segments.length - 1]
    const previewStart = worldToScreen(preview.start, viewport)
    const previewEnd = worldToScreen(preview.end, viewport)

    expect(previewSegment?.from).toEqual([previewStart.x, previewStart.y])
    expect(previewSegment?.to).toEqual([previewEnd.x, previewEnd.y])
    expect(previewSegment?.style).not.toBe(wallSegment?.style)

    expect(recorder.arcs).toHaveLength(1)
    expect(recorder.arcs[0]?.x).toBe(previewStart.x)
    expect(recorder.arcs[0]?.y).toBe(previewStart.y)
  })

  it('paints the selected wall endpoint handles when the option is set and omits them otherwise', () => {
    const viewport = { scale: DEFAULT_PLAN_SCALE, offset: { x: 0, y: 0 } }
    const editedWall: WallSceneNode = {
      id: 'wall:edited',
      kind: 'wall',
      floorId: 'g',
      start: { x: 2000, y: 3000 },
      end: { x: 6000, y: 1000 },
      thickness: 114,
    }
    const base = { walls: [editedWall], viewport, width: 800, height: 600 }

    const without = recordingContext()
    drawPlan(without.ctx, { ...base, selectedIds: new Set<string>() })

    const withHandles = recordingContext()
    drawPlan(withHandles.ctx, {
      ...base,
      selectedIds: new Set<string>(),
      endpointHandles: editedWall,
    })

    const start = worldToScreen(editedWall.start, viewport)
    const end = worldToScreen(editedWall.end, viewport)

    expect(without.arcs).toHaveLength(0)
    expect(withHandles.arcs).toHaveLength(2)
    expect(withHandles.arcs.map((handle) => ({ x: handle.x, y: handle.y }))).toEqual(
      expect.arrayContaining([
        { x: start.x, y: start.y },
        { x: end.x, y: end.y },
      ]),
    )
    expect(withHandles.ops.lastIndexOf('stroke')).toBeLessThan(withHandles.ops.lastIndexOf('arc'))
  })

  it('fills each room polygon beneath the wall strokes', () => {
    const recorder = recordingContext()

    drawPlan(
      recorder.ctx,
      planOptions({ rooms: [rectangleRoom('room:r'), rectangleRoom('room:s', 5000)] }),
    )

    const { ops } = recorder
    expect(ops).toContain('fill')
    expect(ops).toContain('closePath')
    expect(ops.lastIndexOf('fill')).toBeLessThan(ops.indexOf('stroke'))
  })

  it("cuts a room's interior void out of its fill by drawing the hole ring as a second sub-path", () => {
    const viewport = { scale: DEFAULT_PLAN_SCALE }
    // A square void well inside the 4 m by 3 m room, given as a single closed ring.
    const hole = [
      { x: 1000, y: 1000 },
      { x: 2000, y: 1000 },
      { x: 2000, y: 2000 },
      { x: 1000, y: 2000 },
    ]
    const donut: RoomSceneNode = { ...rectangleRoom('room:donut'), holes: [hole] }

    const recorder = recordingContext()
    drawPlan(recorder.ctx, {
      walls: [],
      rooms: [donut],
      viewport,
      width: 800,
      height: 600,
      selectedIds: new Set<string>(),
    })

    // Every corner the fill path visits surfaces as a segment endpoint, since the
    // fake records each lineTo target and the pen position it ran from.
    const visited = recorder.segments.flatMap((segment) => [segment.from, segment.to])
    for (const corner of hole) {
      const screen = worldToScreen(corner, viewport)
      expect(visited).toContainEqual([screen.x, screen.y])
    }

    // The void is cut from the same fill: the room is still painted with one fill,
    // not a separate fill per ring.
    expect(recorder.ops.filter((op) => op === 'fill')).toHaveLength(1)
  })
})

describe('drawPlan wall face ink', () => {
  /** The line width left on the context after drawing a lone wall of `thickness`. */
  function faceInkWidth(thickness: number): number {
    const recorder = recordingContext()
    drawPlan(recorder.ctx, planOptions({ walls: [{ ...wall, thickness }] }))
    return recorder.ctx.lineWidth
  }

  it('inks both wall faces at the cut weight whatever thickness the wall projects to', () => {
    // The poche between the faces carries the thickness now, so the face lines are
    // pure cut ink: a hairline partition and a 1 m thick foundation wall (80 px at
    // this scale) both stroke at the heaviest role in the plan ink hierarchy.
    expect(faceInkWidth(1)).toBe(PLAN_INK_WIDTH.cut)
    expect(faceInkWidth(1000)).toBe(PLAN_INK_WIDTH.cut)
  })
})

describe('drawPlan wall symbology', () => {
  // A door centered on the sample wall clearing 800 of its 1000 mm run, so solid
  // stretches are left at both ends. hostWallId is the RAW wall id: the scene node
  // id 'wall:a' with its 'wall:' prefix stripped.
  // prettier-ignore
  const doorNode: OpeningSceneNode = {
    id: 'opening:a', kind: 'opening', floorId: 'g', type: 'single-swing-door',
    center: { x: 500, y: 0 }, along: { x: 1, y: 0 }, normal: { x: 0, y: 1 },
    width: 800, height: 2032, sillHeight: 0, hostThickness: 114,
    orientation: { hinge: 'start', facing: 'positive' }, hostWallId: 'a',
  }
  // prettier-ignore
  const door: DrawableOpening = {
    node: doorNode, symbol: 'door-swing', double: false, selected: false,
  }

  // A muted sage finish for the painted faces; colorFromHex normalizes it to the
  // same lowercase hex the painted band carries as its stroke style.
  const SAGE_HEX = '#9aa583'
  const paintEveryFace = () => solidTreatment(colorFromHex(SAGE_HEX), 'matte')

  /** The `ops` index of the op that recorded `segments[wanted]`: the fake pushes one `lineTo` op per recorded segment, in order. */
  function opIndexOfSegment(ops: readonly string[], wanted: number): number {
    let seen = 0
    for (const [index, op] of ops.entries()) {
      if (op !== 'lineTo') continue
      if (seen === wanted) return index
      seen += 1
    }
    return -1
  }

  it('leaves the wall centerline unstroked, the two faces carrying the cut line instead', () => {
    const recorder = recordingContext()

    drawPlan(recorder.ctx, planOptions())

    expect(stylesAlong(recorder, CENTERLINE)).toEqual([])
  })

  it('breaks the poche into one fill per solid stretch of a wall an opening cuts', () => {
    const solid = recordingContext()
    drawPlan(solid.ctx, planOptions())

    const broken = recordingContext()
    drawPlan(broken.ctx, planOptions({ openings: [door] }))

    // The door clears the middle of the run, leaving a stub of standing wall at each
    // end, so the cut cavity is filled twice rather than straight through the door.
    expect(pocheFills(solid)).toHaveLength(1)
    expect(pocheFills(broken)).toHaveLength(2)
  })

  it('paints the poche beneath the surface-paint bands and the face lines above them', () => {
    const recorder = recordingContext()

    drawPlan(
      recorder.ctx,
      planOptions({
        surfacePaint: { treatmentForFace: paintEveryFace, activeSurface: null },
      }),
    )

    // A painted face has to stay visible between the wall's fill and its ink, so the
    // band is sandwiched: poche fill, then band, then the face line over both.
    const styles = recorder.segments.map((segment) => segment.style)
    expect(recorder.fills).toContain(DEFAULT_PLAN_PALETTE.poche)
    expect(styles).toContain(SAGE_HEX)
    expect(styles).toContain(DEFAULT_PLAN_PALETTE.wall)

    const pocheFill = recorder.ops.indexOf('fill')
    const band = opIndexOfSegment(recorder.ops, styles.indexOf(SAGE_HEX))
    const faceLine = opIndexOfSegment(recorder.ops, styles.lastIndexOf(DEFAULT_PLAN_PALETTE.wall))
    expect(pocheFill).toBeLessThan(band)
    expect(band).toBeLessThan(faceLine)
  })

  it('mitres the poche where two walls meet at a right angle so the joint tiles', () => {
    const east: WallSceneNode = { ...wall, id: 'wall:east' }
    const north: WallSceneNode = {
      ...wall,
      id: 'wall:north',
      start: { x: 1000, y: 0 },
      end: { x: 1000, y: 1000 },
    }

    const recorder = recordingContext()
    drawPlan(recorder.ctx, planOptions({ walls: [east, north] }))

    // Both runs are 114 thick, so the corner mitres to the inner point where the two
    // inner faces cross and the outer point where the outer faces cross. Square caps
    // would stop at the centerline crossings instead, leaving the joint open.
    const visited = recorder.segments.flatMap((segment) => [segment.from, segment.to])
    const traced = (corner: Point) =>
      visited.some((point) => samePoint(point, worldToScreen(corner, PLAN_VIEWPORT)))

    expect(traced({ x: 943, y: 57 })).toBe(true)
    expect(traced({ x: 1057, y: -57 })).toBe(true)
    expect(traced({ x: 1000, y: 57 })).toBe(false)
    expect(traced({ x: 1000, y: -57 })).toBe(false)
  })
})

describe('drawPlan wall symbology construction-profile thickness', () => {
  // effectiveWallThickness is the resolver these expectations lean on: the same
  // rule the 3D wall builder already draws footprints from (issue #365), applied
  // here to what the face-line offset in the 2D plan symbol should be.
  it('offsets a wall with a known construction profile by half the assembly total, not half its raw thickness', () => {
    const masonryWall: WallSceneNode = { ...wall, constructionProfile: 'solid-masonry-brick' }
    const halfAssembly = effectiveWallThickness(masonryWall) / 2

    const recorder = recordingContext()
    drawPlan(recorder.ctx, planOptions({ walls: [masonryWall] }))

    // The resolved assembly (231 mm) is double the wall's raw thickness (114 mm),
    // so a draw pass still keyed on raw thickness cannot land a face here.
    expect(stylesAlong(recorder, sampleWallFace(halfAssembly))).toContain(DEFAULT_PLAN_PALETTE.wall)
    expect(stylesAlong(recorder, sampleWallFace(-halfAssembly))).toContain(
      DEFAULT_PLAN_PALETTE.wall,
    )
  })

  it('still offsets a wall with no construction profile by half its raw thickness', () => {
    const halfRaw = effectiveWallThickness(wall) / 2

    const recorder = recordingContext()
    drawPlan(recorder.ctx, planOptions())

    expect(stylesAlong(recorder, sampleWallFace(halfRaw))).toContain(DEFAULT_PLAN_PALETTE.wall)
    expect(stylesAlong(recorder, sampleWallFace(-halfRaw))).toContain(DEFAULT_PLAN_PALETTE.wall)
  })

  it('falls back to half the raw thickness, not a zero-width wall, when the construction profile id is not in the registry', () => {
    const unlistedProfileWall: WallSceneNode = {
      ...wall,
      constructionProfile: 'not-a-real-profile',
    }
    const halfRaw = effectiveWallThickness(unlistedProfileWall) / 2

    const recorder = recordingContext()
    drawPlan(recorder.ctx, planOptions({ walls: [unlistedProfileWall] }))

    expect(stylesAlong(recorder, sampleWallFace(halfRaw))).toContain(DEFAULT_PLAN_PALETTE.wall)
    expect(stylesAlong(recorder, sampleWallFace(-halfRaw))).toContain(DEFAULT_PLAN_PALETTE.wall)
  })
})

describe('drawPlan opening resize handles', () => {
  it('paints the opening resize handles when the option is set and omits them otherwise', () => {
    const viewport = { scale: DEFAULT_PLAN_SCALE, offset: { x: 0, y: 0 } }
    // prettier-ignore
    const resizedOpening: OpeningSceneNode = {
      id: 'opening:r', kind: 'opening', floorId: 'g', type: 'single-swing-door',
      center: { x: 4000, y: 2000 }, along: { x: 1, y: 0 }, normal: { x: 0, y: 1 },
      width: 900, height: 2032, sillHeight: 0, hostThickness: 100,
      orientation: { hinge: 'start', facing: 'positive' },
    }
    const base = { walls: [wall], viewport, width: 800, height: 600 }

    const without = recordingContext()
    drawPlan(without.ctx, { ...base, selectedIds: new Set<string>() })

    const withHandles = recordingContext()
    drawPlan(withHandles.ctx, {
      ...base,
      selectedIds: new Set<string>(),
      openingResizeHandles: resizedOpening,
    })

    // The two jambs sit on the wall centerline, half a width to either side of
    // the opening's center along its along-vector, projected to screen space.
    const halfWidth = resizedOpening.width / 2
    const startJamb = {
      x: resizedOpening.center.x - resizedOpening.along.x * halfWidth,
      y: resizedOpening.center.y - resizedOpening.along.y * halfWidth,
    }
    const endJamb = {
      x: resizedOpening.center.x + resizedOpening.along.x * halfWidth,
      y: resizedOpening.center.y + resizedOpening.along.y * halfWidth,
    }
    const start = worldToScreen(startJamb, viewport)
    const end = worldToScreen(endJamb, viewport)

    expect(without.arcs).toHaveLength(0)
    expect(withHandles.arcs).toHaveLength(2)
    expect(withHandles.arcs.map((handle) => ({ x: handle.x, y: handle.y }))).toEqual(
      expect.arrayContaining([
        { x: start.x, y: start.y },
        { x: end.x, y: end.y },
      ]),
    )
    expect(withHandles.ops.lastIndexOf('stroke')).toBeLessThan(withHandles.ops.lastIndexOf('arc'))
  })
})

describe('drawPlan ghost', () => {
  // The wall stroke uses this color while unselected, so a ghost segment painted
  // in a distinct preview style is identifiable apart from the wall (mirroring how
  // the preview/calibration tests distinguish overlay strokes from wall strokes).
  const WALL_COLOR = DEFAULT_PLAN_PALETTE.wall
  const viewport = { scale: DEFAULT_PLAN_SCALE }

  it('strokes each ghost segment between its projected screen endpoints after the walls', () => {
    const recorder = recordingContext()
    const ghost = [{ start: { x: 1000, y: 2000 }, end: { x: 5000, y: 2000 } }]

    drawPlan(recorder.ctx, planOptions({ ghost }))

    const wallIndex = recorder.segments.findIndex((segment) => segment.style === WALL_COLOR)
    const ghostSegment = recorder.segments[recorder.segments.length - 1]
    const start = worldToScreen(ghost[0]!.start, viewport)
    const end = worldToScreen(ghost[0]!.end, viewport)

    expect(ghostSegment?.from).toEqual([start.x, start.y])
    expect(ghostSegment?.to).toEqual([end.x, end.y])
    // The ghost is an overlay painted in its own style, distinct from the wall.
    expect(ghostSegment?.style).not.toBe(WALL_COLOR)
    // It lands after the wall: the plan is painted, then the ghost floats over it.
    expect(recorder.segments.lastIndexOf(ghostSegment!)).toBeGreaterThan(wallIndex)
  })

  it('strokes one segment per ghost entry and records none when ghost is absent', () => {
    const ghost = [
      { start: { x: 0, y: 0 }, end: { x: 1000, y: 0 } },
      { start: { x: 1000, y: 0 }, end: { x: 1000, y: 2000 } },
    ]

    const without = recordingContext()
    drawPlan(without.ctx, planOptions())

    const withGhost = recordingContext()
    drawPlan(withGhost.ctx, planOptions({ ghost }))

    // Whatever the wall itself strokes, a two-segment ghost adds exactly two more
    // stroked segments on top of it.
    expect(without.segments.length).toBeGreaterThan(0)
    expect(withGhost.segments).toHaveLength(without.segments.length + ghost.length)
  })
})

describe('drawPlan room labels', () => {
  it("paints each room's label over the walls when roomLabels is set", () => {
    const recorder = recordingContext()
    const named: RoomSceneNode = { ...rectangleRoom('room:r'), name: 'Parlor' }
    // Grid and rulers stay off (the other fillText source); the "omits grid and
    // rulers" test pins that a roomLabels-free drawPlan paints no fillText.
    drawPlan(
      recorder.ctx,
      planOptions({ rooms: [named], roomLabels: { preferences: DEFAULT_METRIC_PREFERENCES } }),
    )

    expect(recorder.texts.map((entry) => entry.text)).toContain('Parlor')
    expect(recorder.ops.lastIndexOf('stroke')).toBeLessThan(recorder.ops.indexOf('fillText'))
  })
})

describe('drawPlan openings', () => {
  // A horizontal door-swing opening built the way draw-opening.test.ts builds
  // its fixture: leaf along +x, the host wall's left-hand normal pointing +y, a
  // residential width, and a typical interior-wall thickness. A single
  // (non-double) swing adds exactly one swing arc, which is the signal that
  // drawPlan rendered the opening on top of the wall it breaks into.
  // prettier-ignore
  const swingNode: OpeningSceneNode = {
    id: 'opening:a', kind: 'opening', floorId: 'g', type: 'single-swing-door',
    center: { x: 500, y: 0 }, along: { x: 1, y: 0 }, normal: { x: 0, y: 1 },
    width: 800, height: 2032, sillHeight: 0, hostThickness: 114,
    orientation: { hinge: 'start', facing: 'positive' },
  }
  // prettier-ignore
  const swingOpening: DrawableOpening = {
    node: swingNode, symbol: 'door-swing', double: false, selected: false,
  }
  const countArcs = (ops: readonly string[]) => ops.filter((op) => op === 'arc').length

  it('renders each provided opening after the walls, adding a swing arc the wall-only plan lacks', () => {
    const without = recordingContext()
    drawPlan(without.ctx, planOptions())
    const withOpening = recordingContext()
    drawPlan(withOpening.ctx, planOptions({ openings: [swingOpening] }))

    // The single door-swing routine emits exactly one swing arc, so the call
    // carrying an opening records strictly more arcs than the wall-only call.
    expect(countArcs(without.ops)).toBe(0)
    expect(countArcs(withOpening.ops)).toBeGreaterThan(countArcs(without.ops))
    // That arc lands after a wall stroke: the host wall is painted, then broken.
    expect(withOpening.ops.indexOf('arc')).toBeGreaterThan(withOpening.ops.indexOf('stroke'))
  })
})

describe('drawPlan dimensions', () => {
  // A horizontal 1000 mm dimension offset 200 mm to one side, built the way the
  // dimension scene node is projected. drawDimension fills its length label as
  // text, so the call carrying a dimension records more fillText calls than the
  // otherwise-identical call without one, and that label lands after the wall.
  // prettier-ignore
  const dimensionNode: DimensionSceneNode = {
    id: 'dimension:d1', kind: 'dimension', floorId: 'g',
    start: { x: 0, y: 0 }, end: { x: 1000, y: 0 }, offset: 200, length: 1000,
  }
  const dimension: DrawableDimension = { node: dimensionNode, selected: false }
  const countText = (ops: readonly string[]) => ops.filter((op) => op === 'fillText').length

  it('renders each provided dimension after the walls, adding the length label the wall-only plan lacks', () => {
    const labelled = { roomLabels: { preferences: DEFAULT_METRIC_PREFERENCES } }

    const without = recordingContext()
    drawPlan(without.ctx, planOptions(labelled))
    const withDimension = recordingContext()
    drawPlan(withDimension.ctx, planOptions({ ...labelled, dimensions: [dimension] }))

    // The dimension routine fills its length label, so the call carrying a
    // dimension records strictly more fillText calls than the wall-only call.
    expect(countText(withDimension.ops)).toBeGreaterThan(countText(without.ops))
    // That label lands after a wall stroke: the wall is painted, then dimensioned.
    expect(withDimension.ops.indexOf('fillText')).toBeGreaterThan(
      withDimension.ops.indexOf('stroke'),
    )
  })
})

describe('drawPlan furniture', () => {
  // A single armchair-sized footprint placed half a meter into the plan. The
  // furniture painter fills the piece's label as text, so the call carrying a
  // piece records more fillText calls than the otherwise-identical wall-only
  // call, and that label lands after the wall.
  const PIECE_X = 500
  const PIECE_Y = 0
  const PIECE_WIDTH = 600
  const PIECE_DEPTH = 600
  const instance = createFurnitureInstance({
    assetRef: { scope: 'user', contentHash: 'h' },
    position: { x: PIECE_X, y: PIECE_Y },
    footprint: { width: PIECE_WIDTH, depth: PIECE_DEPTH },
    name: 'Armchair',
  })
  const drawable: DrawableFurniture = { instance, selected: false }
  const countText = (ops: readonly string[]) => ops.filter((op) => op === 'fillText').length

  it('renders each provided piece after the walls, adding the footprint label the wall-only plan lacks', () => {
    const without = recordingContext()
    drawPlan(without.ctx, planOptions())
    const withFurniture = recordingContext()
    drawPlan(withFurniture.ctx, planOptions({ furniture: [drawable] }))

    // The furniture routine fills the piece's label, so the call carrying a
    // piece records strictly more fillText calls than the wall-only call.
    expect(countText(withFurniture.ops)).toBeGreaterThan(countText(without.ops))
    // The painted label carries the piece's name.
    expect(withFurniture.texts.map((entry) => entry.text)).toContain('Armchair')
    // That label lands after a wall stroke: the wall is painted, then furnished.
    expect(withFurniture.ops.indexOf('fillText')).toBeGreaterThan(
      withFurniture.ops.indexOf('stroke'),
    )
  })
})

describe('drawPlan stairs', () => {
  // A single straight stair run, sized like a typical residential flight. With no
  // walls, rooms, underlays, grid, or rulers, the only stroke any draw call can
  // record is the stair footprint, so a recorded 'stroke' proves drawPlan painted
  // the stair passed in options.stairs.
  // prettier-ignore
  const straightStair: StairSceneNode = {
    id: 'stair:s1', kind: 'stair', floorId: 'f', wellFloorId: 'f2',
    runType: 'straight', position: { x: 0, y: 0 }, width: 1000, length: 3000, rotation: 0,
  }

  it('strokes each provided stair footprint above the otherwise empty plan', () => {
    const recorder = recordingContext()

    drawPlan(recorder.ctx, {
      walls: [],
      rooms: [],
      viewport: { scale: DEFAULT_PLAN_SCALE },
      width: 800,
      height: 600,
      selectedIds: new Set<string>(),
      stairs: [straightStair],
    })

    // No walls, rooms, underlays, grid, or rulers means the stair footprint is the
    // only thing that can stroke, so a recorded stroke is the stair being drawn.
    expect(recorder.ops).toContain('stroke')
  })
})

describe('drawPlan selection overlays', () => {
  const viewport = { scale: DEFAULT_PLAN_SCALE, offset: { x: 0, y: 0 } }

  it('strokes a highlight around a selected room and leaves an unselected room fill-only', () => {
    const room = rectangleRoom('room:r')
    const base = {
      walls: [] as WallSceneNode[],
      rooms: [room],
      viewport,
      width: 800,
      height: 600,
    }

    const unselected = recordingContext()
    drawPlan(unselected.ctx, { ...base, selectedIds: new Set<string>() })

    const selected = recordingContext()
    drawPlan(selected.ctx, { ...base, selectedIds: new Set(['room:r']) })

    expect(unselected.ops).not.toContain('stroke')
    expect(selected.ops).toContain('stroke')
    expect(selected.segments.length).toBeGreaterThan(0)
  })

  it('paints the marquee when the option is set and omits it otherwise', () => {
    const marquee: Bounds = { min: { x: 1000, y: 1000 }, max: { x: 5000, y: 5000 } }
    const base = { walls: [wall], viewport, width: 800, height: 600 }

    const without = recordingContext()
    drawPlan(without.ctx, { ...base, selectedIds: new Set<string>() })

    const withMarquee = recordingContext()
    drawPlan(withMarquee.ctx, { ...base, selectedIds: new Set<string>(), marquee })

    const min = worldToScreen(marquee.min, viewport)
    const max = worldToScreen(marquee.max, viewport)
    expect(without.fillRects).toHaveLength(0)
    expect(withMarquee.fillRects).toContainEqual(
      expect.objectContaining({
        x: min.x,
        y: min.y,
        w: max.x - min.x,
        h: max.y - min.y,
      }),
    )
  })
})

describe('drawPlan hover preview', () => {
  const viewport = { scale: DEFAULT_PLAN_SCALE, offset: { x: 0, y: 0 } }

  // prettier-ignore
  const swingNode: OpeningSceneNode = {
    id: 'opening:a', kind: 'opening', floorId: 'g', type: 'single-swing-door',
    center: { x: 500, y: 0 }, along: { x: 1, y: 0 }, normal: { x: 0, y: 1 },
    width: 800, height: 2032, sillHeight: 0, hostThickness: 114,
    orientation: { hinge: 'start', facing: 'positive' },
  }
  // prettier-ignore
  const swingOpening: DrawableOpening = {
    node: swingNode, symbol: 'door-swing', double: false, selected: false,
  }
  // prettier-ignore
  const dimensionNode: DimensionSceneNode = {
    id: 'dimension:d1', kind: 'dimension', floorId: 'g',
    start: { x: 0, y: 0 }, end: { x: 1000, y: 0 }, offset: 200, length: 1000,
  }
  const dimension: DrawableDimension = { node: dimensionNode, selected: false }

  const styles = (recorder: ReturnType<typeof recordingContext>) =>
    new Set(recorder.segments.map((segment) => segment.style))

  /** The stroke styles that appear in `withHover` but are absent in `baseline`. */
  function hoverStyles(
    baseline: ReturnType<typeof recordingContext>,
    withHover: ReturnType<typeof recordingContext>,
  ) {
    const before = styles(baseline)
    return [...styles(withHover)].filter((style) => !before.has(style))
  }

  it('adds a wall hover stroke whose style differs from the default and the selected wall', () => {
    const without = recordingContext()
    drawPlan(without.ctx, planOptions())
    const hovered = recordingContext()
    drawPlan(hovered.ctx, planOptions({ hoveredId: 'wall:a' }))
    const selected = recordingContext()
    drawPlan(selected.ctx, planOptions({ selectedIds: new Set(['wall:a']) }))

    const added = hoverStyles(without, hovered)
    expect(added).toHaveLength(1)
    expect(styles(selected)).not.toContain(added[0])
  })

  it('adds a room hover stroke distinct from the selected-room highlight', () => {
    const room = rectangleRoom('room:r')
    const base = { walls: [] as WallSceneNode[], rooms: [room], viewport, width: 800, height: 600 }

    const without = recordingContext()
    drawPlan(without.ctx, { ...base, selectedIds: new Set<string>() })
    const hovered = recordingContext()
    drawPlan(hovered.ctx, { ...base, selectedIds: new Set<string>(), hoveredId: 'room:r' })
    const selected = recordingContext()
    drawPlan(selected.ctx, { ...base, selectedIds: new Set(['room:r']) })

    // An unhovered, unselected room runs no stroke: the hover adds the first one.
    expect(without.ops).not.toContain('stroke')
    expect(hovered.ops).toContain('stroke')
    const added = hoverStyles(without, hovered)
    expect(added).toHaveLength(1)
    expect(styles(selected)).not.toContain(added[0])
  })

  it('adds an opening hover stroke absent from the unhovered plan', () => {
    const base = { ...planOptions({ openings: [swingOpening] }) }

    const without = recordingContext()
    drawPlan(without.ctx, base)
    const hovered = recordingContext()
    drawPlan(hovered.ctx, { ...base, hoveredId: 'opening:a' })

    expect(hoverStyles(without, hovered).length).toBeGreaterThan(0)
  })

  it('adds a dimension hover stroke absent from the unhovered plan', () => {
    const base = { ...planOptions({ dimensions: [dimension] }) }

    const without = recordingContext()
    drawPlan(without.ctx, base)
    const hovered = recordingContext()
    drawPlan(hovered.ctx, { ...base, hoveredId: 'dimension:d1' })

    expect(hoverStyles(without, hovered).length).toBeGreaterThan(0)
  })

  it('leaves the plan unchanged when hoveredId names no entity in the scene', () => {
    const without = recordingContext()
    drawPlan(without.ctx, planOptions())
    const missing = recordingContext()
    drawPlan(missing.ctx, planOptions({ hoveredId: 'wall:missing' }))

    // A hover target the scene does not contain adds no stroke: the styles match.
    expect([...styles(missing)]).toEqual([...styles(without)])
  })
})

describe('drawPlan emphasis relative to cut', () => {
  it('emphasizes the hover highlight relative to the cut weight so a future retune keeps it heavier', () => {
    const recorder = recordingContext()

    drawPlan(recorder.ctx, planOptions({ hoveredId: 'wall:a' }))

    expect(recorder.ctx.lineWidth).toBe(PLAN_INK_WIDTH.cut + 1)
  })

  it('emphasizes the selected-room highlight relative to the cut weight so a future retune keeps it heavier', () => {
    const recorder = recordingContext()
    const room = rectangleRoom('room:r')

    drawPlan(recorder.ctx, {
      walls: [] as WallSceneNode[],
      rooms: [room],
      viewport: { scale: DEFAULT_PLAN_SCALE, offset: { x: 0, y: 0 } },
      width: 800,
      height: 600,
      selectedIds: new Set(['room:r']),
    })

    expect(recorder.ctx.lineWidth).toBe(PLAN_INK_WIDTH.cut + 1)
  })
})

describe('drawPlan grid and rulers', () => {
  const room = rectangleRoom('room:r')

  it('paints grid beneath rooms and rulers above walls when enabled', () => {
    const recorder = recordingContext()

    drawPlan(recorder.ctx, {
      walls: [wall],
      rooms: [room],
      viewport: { scale: DEFAULT_PLAN_SCALE, offset: { x: 0, y: 0 } },
      width: 200,
      height: 200,
      selectedIds: new Set<string>(),
      grid: true,
      rulers: true,
    })

    const { ops } = recorder
    expect(ops.indexOf('stroke')).toBeLessThan(ops.indexOf('fill'))
    expect(ops).toContain('fillRect')
    expect(ops.indexOf('fillText')).toBeGreaterThan(ops.lastIndexOf('fill'))
  })

  it('omits grid and rulers when the flags are absent', () => {
    const recorder = recordingContext()
    drawPlan(recorder.ctx, planOptions())

    const enabled = recordingContext()
    drawPlan(enabled.ctx, planOptions({ grid: true, rulers: true }))

    expect(recorder.ops).not.toContain('fillText')
    expect(recorder.ops).not.toContain('fillRect')
    // Only the wall itself is painted: none of the grid lines the flagged call
    // strokes over the same viewport show up.
    expect(recorder.segments.length).toBeLessThan(enabled.segments.length)
  })
})

describe('drawEndpointHandles', () => {
  const PAN_OFFSET = { x: 17, y: 23 }

  it('paints one handle at each endpoint projected to screen space', () => {
    const recorder = recordingContext()
    const viewport = { scale: DEFAULT_PLAN_SCALE, offset: PAN_OFFSET }
    const editedWall: WallSceneNode = {
      id: 'wall:edited',
      kind: 'wall',
      floorId: 'g',
      start: { x: 2000, y: 3000 },
      end: { x: 6000, y: 1000 },
      thickness: 114,
    }

    drawEndpointHandles(recorder.ctx, editedWall, planOptions({ viewport }))

    const start = worldToScreen(editedWall.start, viewport)
    const end = worldToScreen(editedWall.end, viewport)
    expect(recorder.arcs).toHaveLength(2)
    expect(recorder.arcs.map((handle) => ({ x: handle.x, y: handle.y }))).toEqual(
      expect.arrayContaining([
        { x: start.x, y: start.y },
        { x: end.x, y: end.y },
      ]),
    )
  })
})

describe('drawOpeningResizeHandles', () => {
  const PAN_OFFSET = { x: 17, y: 23 }

  it('paints one handle at each jamb projected to screen space', () => {
    const recorder = recordingContext()
    const viewport = { scale: DEFAULT_PLAN_SCALE, offset: PAN_OFFSET }
    // prettier-ignore
    const resizedOpening: OpeningSceneNode = {
      id: 'opening:r', kind: 'opening', floorId: 'g', type: 'single-swing-door',
      center: { x: 4000, y: 2000 }, along: { x: 1, y: 0 }, normal: { x: 0, y: 1 },
      width: 900, height: 2032, sillHeight: 0, hostThickness: 100,
      orientation: { hinge: 'start', facing: 'positive' },
    }

    drawOpeningResizeHandles(recorder.ctx, resizedOpening, viewport)

    const halfWidth = resizedOpening.width / 2
    const startJamb = {
      x: resizedOpening.center.x - resizedOpening.along.x * halfWidth,
      y: resizedOpening.center.y - resizedOpening.along.y * halfWidth,
    }
    const endJamb = {
      x: resizedOpening.center.x + resizedOpening.along.x * halfWidth,
      y: resizedOpening.center.y + resizedOpening.along.y * halfWidth,
    }
    const start = worldToScreen(startJamb, viewport)
    const end = worldToScreen(endJamb, viewport)
    expect(recorder.arcs).toHaveLength(2)
    expect(recorder.arcs.map((handle) => ({ x: handle.x, y: handle.y }))).toEqual(
      expect.arrayContaining([
        { x: start.x, y: start.y },
        { x: end.x, y: end.y },
      ]),
    )
  })
})

describe('drawMarquee', () => {
  it('fills a rectangle covering the marquee projected to screen space', () => {
    const recorder = recordingContext()
    const viewport = { scale: DEFAULT_PLAN_SCALE, offset: { x: 10, y: 20 } }
    const rect: Bounds = { min: { x: 1000, y: 2000 }, max: { x: 5000, y: 6000 } }

    drawMarquee(recorder.ctx, rect, planOptions({ viewport }))

    const min = worldToScreen(rect.min, viewport)
    const max = worldToScreen(rect.max, viewport)
    expect(recorder.fillRects).toContainEqual(
      expect.objectContaining({
        x: min.x,
        y: min.y,
        w: max.x - min.x,
        h: max.y - min.y,
      }),
    )
  })
})

describe('drawGrid', () => {
  it('strokes vertical and horizontal grid lines spanning the canvas in one color', () => {
    const recorder = recordingContext()

    drawGrid(
      recorder.ctx,
      planOptions({ viewport: { scale: 0.1, offset: { x: 0, y: 0 } }, width: 100, height: 100 }),
    )

    // 6 verticals + 6 horizontals at 200 mm spacing across a 100 px (1000 mm) canvas
    expect(recorder.segments).toHaveLength(12)

    const styles = new Set(recorder.segments.map((segment) => segment.style))
    expect(styles.size).toBe(1)

    const verticals = recorder.segments.filter((segment) => segment.from[0] === segment.to[0])
    expect(verticals).toHaveLength(6)
    expect(verticals.every((segment) => segment.from[1] === 0 && segment.to[1] === 100)).toBe(true)
  })
})

describe('drawRulers', () => {
  it('fills the top and left ruler bands and draws unit-formatted tick labels', () => {
    const recorder = recordingContext()

    drawRulers(
      recorder.ctx,
      planOptions({ viewport: { scale: 0.1, offset: { x: 0, y: 0 } }, width: 100, height: 100 }),
    )

    // a band along the top and a band along the left
    expect(recorder.fillRects.length).toBeGreaterThanOrEqual(2)
    // the origin label appears as text when in view at offset 0, formatted in the
    // metric default unit system
    expect(recorder.texts.map((entry) => entry.text)).toContain('0.00 m')
  })

  it('draws short minor ticks at each grid line and full-height major ticks at the labels', () => {
    const recorder = recordingContext()

    drawRulers(
      recorder.ctx,
      planOptions({ viewport: { scale: 0.1, offset: { x: 0, y: 0 } }, width: 100, height: 100 }),
    )

    // Top-band ticks are vertical segments (constant x) within the ruler band.
    const topTicks = recorder.segments.filter(
      (segment) =>
        segment.from[0] === segment.to[0] &&
        segment.from[1] <= RULER_THICKNESS_PX &&
        segment.to[1] <= RULER_THICKNESS_PX,
    )
    const lengths = topTicks.map((segment) => Math.abs(segment.to[1] - segment.from[1]))
    const major = lengths.filter((length) => length === RULER_THICKNESS_PX)
    const minor = lengths.filter((length) => length > 0 && length < RULER_THICKNESS_PX)

    // Labels sit at the coarser spacing; the per-grid-line minor ticks are finer, so
    // they outnumber the full-height major ticks.
    expect(major.length).toBeGreaterThan(0)
    expect(minor.length).toBeGreaterThan(major.length)
  })
})

describe('drawRoomLabel', () => {
  // rectangleRoom is a 4 m by 3 m rectangle whose vertices average to the world
  // centroid below; a pan offset makes the projection non-trivial so the label
  // must track it. (The formatted area string is irrelevant to placement.)
  const CENTROID_WORLD = { x: 2000, y: 1500 }
  const VIEWPORT = { scale: DEFAULT_PLAN_SCALE, offset: { x: 31, y: 47 } }

  function room(overrides: Partial<RoomSceneNode> = {}): RoomSceneNode {
    return { ...rectangleRoom('room:r'), ...overrides }
  }

  it('paints the name then the area below it at the projected centroid for a named room', () => {
    const recorder = recordingContext()

    drawRoomLabel(recorder.ctx, room({ name: 'Parlor' }), {
      viewport: VIEWPORT,
      preferences: DEFAULT_METRIC_PREFERENCES,
      label: DEFAULT_PLAN_PALETTE.label,
    })

    const centroid = worldToScreen(CENTROID_WORLD, VIEWPORT)
    const fillTexts = recorder.texts
    expect(fillTexts).toHaveLength(2)

    const [nameLine, areaLine] = fillTexts
    expect(nameLine?.text).toBe('Parlor')
    expect(nameLine?.x).toBe(centroid.x)
    expect(nameLine?.y).toBe(centroid.y)

    // The area is a second line below the name: same x, greater y.
    expect(areaLine?.x).toBe(centroid.x)
    expect(areaLine?.y).toBeGreaterThan(centroid.y)
  })

  it('paints only the area at the projected centroid for an unnamed room', () => {
    const recorder = recordingContext()

    drawRoomLabel(recorder.ctx, room(), {
      viewport: VIEWPORT,
      preferences: DEFAULT_METRIC_PREFERENCES,
      label: DEFAULT_PLAN_PALETTE.label,
    })

    const centroid = worldToScreen(CENTROID_WORLD, VIEWPORT)
    const fillTexts = recorder.texts
    expect(fillTexts).toHaveLength(1)
    expect(fillTexts[0]?.x).toBe(centroid.x)
    expect(fillTexts[0]?.y).toBe(centroid.y)
  })
})

describe('drawPlan palette', () => {
  const palette: PlanPalette = {
    grid: '#101010',
    wall: '#202020',
    roomFill: '#303030',
    poche: '#353535',
    rulerBand: '#404040',
    rulerTick: '#505050',
    rulerText: '#606060',
    selection: '#707070',
    hover: '#808080',
    preview: '#909090',
    selectionFill: '#a0a0a0',
    marqueeFill: 'rgba(11, 22, 33, 0.12)',
    ghost: 'rgba(12, 34, 56, 0.5)',
    label: '#b0b0b0',
  }

  it('draws the grid, the room fill, and a selected wall in the palette colors', () => {
    const recorder = recordingContext()

    drawPlan(
      recorder.ctx,
      planOptions({
        palette,
        rooms: [rectangleRoom('room:r')],
        selectedIds: new Set(['wall:a']),
        grid: true,
      }),
    )

    const strokeStyles = new Set(recorder.segments.map((segment) => segment.style))
    expect(strokeStyles).toContain('#101010') // grid lines
    expect(strokeStyles).toContain('#707070') // the selected wall
    expect(recorder.fills).toContain('#303030') // the room fill
  })

  it('draws an unselected wall in the palette wall color', () => {
    const recorder = recordingContext()

    drawPlan(recorder.ctx, planOptions({ palette }))

    expect(recorder.segments.map((segment) => segment.style)).toContain('#202020')
  })

  it('fills a selected room in the palette selection-fill color', () => {
    const recorder = recordingContext()

    drawPlan(
      recorder.ctx,
      planOptions({
        palette,
        rooms: [rectangleRoom('room:r')],
        selectedIds: new Set(['room:r']),
      }),
    )

    expect(recorder.fills).toContain('#a0a0a0')
  })

  it("keeps a selected room's paint visible instead of covering it with the selection fill", () => {
    const recorder = recordingContext()

    drawPlan(
      recorder.ctx,
      planOptions({
        palette,
        rooms: [rectangleRoom('room:r')],
        selectedIds: new Set(['room:r']),
        roomFillColor: '#9aa583',
      }),
    )

    expect(recorder.fills).toContain('#9aa583')
    expect(recorder.fills).not.toContain('#a0a0a0')
  })

  it('draws the wall preview line and its start marker in the palette preview color', () => {
    const recorder = recordingContext()

    drawPlan(
      recorder.ctx,
      planOptions({ palette, preview: { start: { x: 0, y: 0 }, end: { x: 1000, y: 0 } } }),
    )

    const previewSegment = recorder.segments[recorder.segments.length - 1]
    expect(previewSegment?.style).toBe('#909090')
    expect(recorder.arcs.some((arc) => arc.fillStyle === '#909090')).toBe(true)
  })

  it('draws the hover highlight in the palette hover color', () => {
    const recorder = recordingContext()

    drawPlan(recorder.ctx, planOptions({ palette, hoveredId: 'wall:a' }))

    expect(recorder.segments.some((segment) => segment.style === '#808080')).toBe(true)
  })

  it('strokes the marquee in the selection color and fills it in the marquee-fill color', () => {
    const recorder = recordingContext()
    const marquee: Bounds = { min: { x: 1000, y: 1000 }, max: { x: 5000, y: 5000 } }

    drawPlan(recorder.ctx, planOptions({ palette, marquee }))

    expect(recorder.segments.some((segment) => segment.style === '#707070')).toBe(true)
    expect(recorder.fillRects.some((rect) => rect.style === 'rgba(11, 22, 33, 0.12)')).toBe(true)
  })

  // prettier-ignore
  const swingNode: OpeningSceneNode = {
    id: 'opening:a', kind: 'opening', floorId: 'g', type: 'single-swing-door',
    center: { x: 500, y: 0 }, along: { x: 1, y: 0 }, normal: { x: 0, y: 1 },
    width: 800, height: 2032, sillHeight: 0, hostThickness: 114,
    orientation: { hinge: 'start', facing: 'positive' },
  }
  // prettier-ignore
  const dimensionNode: DimensionSceneNode = {
    id: 'dimension:d1', kind: 'dimension', floorId: 'g',
    start: { x: 0, y: 0 }, end: { x: 1000, y: 0 }, offset: 200, length: 1000,
  }

  it('highlights a selected opening in the palette selection color', () => {
    const recorder = recordingContext()
    const opening: DrawableOpening = {
      node: swingNode,
      symbol: 'door-swing',
      double: false,
      selected: true,
    }

    drawPlan(recorder.ctx, planOptions({ palette, walls: [], openings: [opening] }))

    expect(recorder.segments.some((segment) => segment.style === '#707070')).toBe(true)
  })

  it('draws opening symbol ink in the palette wall color', () => {
    const recorder = recordingContext()
    const opening: DrawableOpening = {
      node: swingNode,
      symbol: 'door-swing',
      double: false,
      selected: false,
    }

    drawPlan(recorder.ctx, planOptions({ palette, walls: [], openings: [opening] }))

    expect(recorder.segments.some((segment) => segment.style === '#202020')).toBe(true)
  })

  it('highlights a selected dimension in the palette selection color', () => {
    const recorder = recordingContext()
    const dimension: DrawableDimension = { node: dimensionNode, selected: true }

    drawPlan(recorder.ctx, planOptions({ palette, walls: [], dimensions: [dimension] }))

    expect(recorder.segments.some((segment) => segment.style === '#707070')).toBe(true)
  })

  it('draws dimension ink in the palette wall color', () => {
    const recorder = recordingContext()
    const dimension: DrawableDimension = { node: dimensionNode, selected: false }

    drawPlan(recorder.ctx, planOptions({ palette, walls: [], dimensions: [dimension] }))

    expect(recorder.segments.some((segment) => segment.style === '#202020')).toBe(true)
  })

  // prettier-ignore
  const stairNode: StairSceneNode = {
    id: 'stair:s1', kind: 'stair', floorId: 'f1', wellFloorId: 'f2', runType: 'straight',
    position: { x: 0, y: 0 }, width: 1000, length: 3000, rotation: 0,
  }

  it('strokes the move-drag ghost in the palette ghost color', () => {
    const recorder = recordingContext()

    drawPlan(
      recorder.ctx,
      planOptions({ palette, ghost: [{ start: { x: 0, y: 0 }, end: { x: 1000, y: 0 } }] }),
    )

    expect(recorder.segments.some((segment) => segment.style === 'rgba(12, 34, 56, 0.5)')).toBe(
      true,
    )
  })

  it('draws stair ink in the palette wall color', () => {
    const recorder = recordingContext()

    drawPlan(recorder.ctx, planOptions({ palette, walls: [], stairs: [stairNode] }))

    expect(recorder.segments.some((segment) => segment.style === '#202020')).toBe(true)
  })

  it('fills the room label text in the palette label color', () => {
    const recorder = recordingContext()

    drawPlan(
      recorder.ctx,
      planOptions({
        palette,
        rooms: [rectangleRoom('room:r')],
        roomLabels: { preferences: DEFAULT_METRIC_PREFERENCES },
      }),
    )

    expect(recorder.texts.some((entry) => entry.style === '#b0b0b0')).toBe(true)
  })

  it('fills the dimension length text in the palette label color', () => {
    const recorder = recordingContext()
    const dimension: DrawableDimension = { node: dimensionNode, selected: false }

    drawPlan(recorder.ctx, planOptions({ palette, walls: [], dimensions: [dimension] }))

    expect(recorder.texts.some((entry) => entry.style === '#b0b0b0')).toBe(true)
  })
})

describe('drawPlan floor fill tint', () => {
  it('tints the room fills with the floor paint color when one is set', () => {
    const recorder = recordingContext()
    drawPlan(
      recorder.ctx,
      planOptions({ rooms: [rectangleRoom('room:r')], roomFillColor: '#9aa583' }),
    )
    expect(recorder.fills).toContain('#9aa583')
  })

  it('uses the default room fill when no floor paint is set', () => {
    const recorder = recordingContext()
    drawPlan(recorder.ctx, planOptions({ rooms: [rectangleRoom('room:r')] }))
    expect(recorder.fills).toContain(DEFAULT_PLAN_PALETTE.roomFill)
  })
})

// One world millimeter maps to one screen pixel, so the room and dimension
// declutter fixtures below project to easily reasoned screen rects. They reuse
// the exact collision setups the pure layout tests (label-layout.test.ts
// behaviors 4/5) proved overlap at their raw centroids/midpoints. labelBox and
// labelsOverlap are the public layout helpers, used here as black boxes to read
// a painted label's box back from its recorded fillText position.
const DECLUTTER_VIEWPORT = { scale: 1, offset: { x: 0, y: 0 } }
const DECLUTTER_LABEL_FONT = { sizePx: 12 }

/** A 4 m by 3 m room large enough that its name label is shown, not hidden. */
function largeRoom(id: string, name: string, originX: number): RoomSceneNode {
  const polygon = [
    { x: originX, y: 0 },
    { x: originX + 4000, y: 0 },
    { x: originX + 4000, y: 3000 },
    { x: originX, y: 3000 },
  ]
  return { id, kind: 'room', floorId: 'f', polygon, clearPolygon: polygon, area: 12_000_000, name }
}

/** A horizontal 1 m dimension over the same x-span at the given perpendicular offset. */
function horizontalDimension(id: string, offset: number): DrawableDimension {
  const node: DimensionSceneNode = {
    id,
    kind: 'dimension',
    floorId: 'f',
    start: { x: 0, y: 0 },
    end: { x: 1000, y: 0 },
    offset,
    length: 1000,
  }
  return { node, selected: false }
}

/** The de-conflicted box a recorded label occupies, read back from its fillText position. */
function paintedLabelBox(entry: { text: string; x: number; y: number }): Bounds {
  return labelBox(entry.text, { x: entry.x, y: entry.y }, DECLUTTER_LABEL_FONT)
}

describe('drawPlan room label declutter', () => {
  it('paints two colliding room labels at de-conflicted, non-overlapping screen positions', () => {
    // Two rooms 10 px apart at unit scale. At the raw centroids their "WC" name
    // boxes (~13 px wide) straddle each other, so painting at the centroid stacks
    // them. The wired layout pass must move the recorded fillText positions apart.
    const first = largeRoom('room-a', 'WC', 0)
    const second = largeRoom('room-b', 'WC', 10)

    const recorder = recordingContext()
    drawPlan(recorder.ctx, {
      walls: [],
      rooms: [first, second],
      viewport: DECLUTTER_VIEWPORT,
      width: 800,
      height: 600,
      selectedIds: new Set<string>(),
      roomLabels: { preferences: DEFAULT_METRIC_PREFERENCES },
    })

    const names = recorder.texts.filter((entry) => entry.text === 'WC')
    expect(names).toHaveLength(2)

    // Read each painted label's box back from its recorded position and assert the
    // two no longer overlap. At the raw centroids these boxes intersect; only a
    // draw path that honors layoutRoomLabels separates them.
    expect(labelsOverlap(paintedLabelBox(names[0]!), paintedLabelBox(names[1]!))).toBe(false)
  })

  it('emits no fillText for a room whose label placement is hidden', () => {
    // A room far too small at this zoom to seat even its name line, so its
    // placement is hidden and the draw path must skip its label entirely. A
    // generously sized neighbor keeps its label, proving labels are still painted.
    const tiny: RoomSceneNode = {
      id: 'room-tiny',
      kind: 'room',
      floorId: 'f',
      polygon: [
        { x: 0, y: 0 },
        { x: 8, y: 0 },
        { x: 8, y: 8 },
        { x: 0, y: 8 },
      ],
      clearPolygon: [
        { x: 0, y: 0 },
        { x: 8, y: 0 },
        { x: 8, y: 8 },
        { x: 0, y: 8 },
      ],
      area: 64,
      name: 'Powder Room',
    }
    const roomy = largeRoom('room-big', 'Parlor', 2000)

    const recorder = recordingContext()
    drawPlan(recorder.ctx, {
      walls: [],
      rooms: [tiny, roomy],
      viewport: DECLUTTER_VIEWPORT,
      width: 800,
      height: 600,
      selectedIds: new Set<string>(),
      roomLabels: { preferences: DEFAULT_METRIC_PREFERENCES },
    })

    const painted = recorder.texts.map((entry) => entry.text)
    expect(painted).not.toContain('Powder Room')
    expect(painted).toContain('Parlor')
  })
})

describe('drawPlan dimension label declutter', () => {
  it('paints two colliding dimension labels at de-conflicted, non-overlapping screen positions', () => {
    // Two parallel 1 m dimensions over the same x-span (identical "1.00 m" label
    // text) whose offset lines sit 5 px apart at unit scale. Their raw midpoint
    // label boxes straddle each other, so painting at the midpoint stacks them.
    const first = horizontalDimension('dim-a', 0)
    const second = horizontalDimension('dim-b', 5)

    const recorder = recordingContext()
    drawPlan(recorder.ctx, {
      walls: [],
      viewport: DECLUTTER_VIEWPORT,
      width: 800,
      height: 600,
      selectedIds: new Set<string>(),
      dimensions: [first, second],
    })

    const labels = recorder.texts.filter((entry) => entry.text === '1.00 m')
    expect(labels).toHaveLength(2)

    expect(labelsOverlap(paintedLabelBox(labels[0]!), paintedLabelBox(labels[1]!))).toBe(false)
  })
})

describe('drawPlan y-up orientation (regression guard for vertical mirroring)', () => {
  // The file format defines world y as increasing UPWARD: a larger +y is "north",
  // toward the top of the plan. This guard pins the end-to-end contract that a
  // spec-conformant document is NOT rendered vertically mirrored. A plan with an
  // asymmetric feature at high +y and nothing comparable at low y must paint that
  // feature in the UPPER half of the canvas. The asserted screen-y is read from the
  // RECORDED draw calls (never from worldToScreen) so a future re-mirroring of the
  // projection cannot pass by quietly recomputing the same wrong expectation.
  const CANVAS_WIDTH = 800
  const CANVAS_HEIGHT = 600

  // A wide base wall low at the south edge plus a short distinctive feature wall
  // high at the north edge. Only the north wall sits at the top of the world
  // bounds, so it is the one whose screen position the y-up convention pins.
  const SOUTH_Y = 0
  const NORTH_Y = 10000
  const baseWall: WallSceneNode = {
    id: 'wall:south-base',
    kind: 'wall',
    floorId: 'g',
    start: { x: 0, y: SOUTH_Y },
    end: { x: 8000, y: SOUTH_Y },
    thickness: 114,
  }
  const northFeature: WallSceneNode = {
    id: 'wall:north-feature',
    kind: 'wall',
    floorId: 'g',
    start: { x: 0, y: NORTH_Y },
    end: { x: 1500, y: NORTH_Y },
    thickness: 114,
  }

  it('paints geometry at high +y (north) in the upper half of the canvas, not the lower half', () => {
    const walls = [baseWall, northFeature]
    const bounds = contentBounds(planContentPoints(walls, []))!
    const viewport = computeFitViewport(bounds, { width: CANVAS_WIDTH, height: CANVAS_HEIGHT })

    const recorder = recordingContext()
    drawPlan(recorder.ctx, {
      walls,
      viewport,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      selectedIds: new Set<string>(),
    })

    // Read the painted screen-y of every wall endpoint straight from the recorder.
    const drawnYs = recorder.segments.flatMap((segment) => [segment.from[1], segment.to[1]])
    expect(drawnYs.length).toBeGreaterThan(0)

    // The north feature is the only geometry at the top of the world bounds, so the
    // smallest painted screen-y in a correct (y-up) render belongs to it; the south
    // base owns the largest. North must sit ABOVE the canvas midline.
    const topDrawnY = Math.min(...drawnYs)
    const bottomDrawnY = Math.max(...drawnYs)
    expect(topDrawnY).toBeLessThan(CANVAS_HEIGHT / 2)
    expect(bottomDrawnY).toBeGreaterThan(topDrawnY)
  })
})
