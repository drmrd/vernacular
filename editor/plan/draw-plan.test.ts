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
import { DEFAULT_PLAN_PALETTE, type PlanPalette } from './plan-palette'
import type { DrawableOpening } from './draw-opening'
import type { DrawableDimension } from './draw-dimension'
import { DEFAULT_PLAN_SCALE, worldToScreen } from './viewport'
import type { Bounds } from './fit'
import { DEFAULT_METRIC_PREFERENCES } from '../../core'
import type {
  DimensionSceneNode,
  OpeningSceneNode,
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

describe('drawPlan', () => {
  it('clears the surface and strokes each wall projected to screen space', () => {
    const recorder = recordingContext()

    drawPlan(recorder.ctx, planOptions())

    expect(recorder.clearCount()).toBe(1)
    expect(recorder.segments).toHaveLength(1)
    expect(recorder.segments[0]?.from).toEqual([0, 0])
    expect(recorder.segments[0]?.to).toEqual([1000 * DEFAULT_PLAN_SCALE, 0])
  })

  it('strokes a selected wall in a different color than an unselected one', () => {
    const unselected = recordingContext()
    drawPlan(unselected.ctx, {
      walls: [wall],
      viewport: { scale: DEFAULT_PLAN_SCALE },
      width: 800,
      height: 600,
      selectedIds: new Set(),
    })

    const selected = recordingContext()
    drawPlan(selected.ctx, {
      walls: [wall],
      viewport: { scale: DEFAULT_PLAN_SCALE },
      width: 800,
      height: 600,
      selectedIds: new Set(['wall:a']),
    })

    expect(selected.segments[0]?.style).not.toBe(unselected.segments[0]?.style)
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

    // The wall-only plan strokes just its single wall; a two-segment ghost adds
    // exactly two more stroked segments on top of it.
    expect(without.segments).toHaveLength(1)
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

    drawPlan(recorder.ctx, {
      walls: [wall],
      viewport: { scale: DEFAULT_PLAN_SCALE },
      width: 800,
      height: 600,
      selectedIds: new Set<string>(),
    })

    expect(recorder.ops).not.toContain('fillText')
    expect(recorder.ops).not.toContain('fillRect')
    expect(recorder.segments).toHaveLength(1)
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
    expect(recorder.texts.map((entry) => entry.text)).toContain('0 mm')
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
    rulerBand: '#404040',
    rulerTick: '#505050',
    rulerText: '#606060',
    selection: '#707070',
    hover: '#808080',
    preview: '#909090',
    selectionFill: '#a0a0a0',
    marqueeFill: 'rgba(11, 22, 33, 0.12)',
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
