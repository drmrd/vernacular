import { expect, it } from 'vitest'
import { colorFromHex, solidTreatment, type WallSceneNode } from '../../core'
import type { DrawableOpening } from './draw-opening'
import { drawPlan } from './draw-plan'
import { recordingContext, sampleWall } from './draw-plan-test-fixtures'
import { worldToScreen } from './viewport'

const SAGE = '#9aa583'
const PLUM = '#765576'
const VIEWPORT = { scale: 0.125, offset: { x: 150, y: 100 } }
const FINISHES = new Map([
  ['first', solidTreatment(colorFromHex(SAGE), 'matte')],
  ['second', solidTreatment(colorFromHex(PLUM), 'satin')],
])

type Interval = readonly [start: number, end: number]

function paintedWall(id: string, [from, to]: Interval, thickness: number): WallSceneNode {
  return {
    ...sampleWall,
    id: `wall:${id}`,
    start: { x: from, y: 0 },
    end: { x: to, y: 0 },
    thickness,
  }
}

const doorway: DrawableOpening = {
  node: {
    id: 'opening:door',
    kind: 'opening',
    floorId: 'g',
    type: 'cased-opening',
    center: { x: 2500, y: 0 },
    along: { x: 1, y: 0 },
    normal: { x: 0, y: 1 },
    width: 600,
    height: 2032,
    sillHeight: 0,
    hostThickness: 120,
    orientation: { hinge: 'start', facing: 'positive' },
    hostWallId: 'first',
  },
  symbol: 'cased-opening',
  double: false,
  selected: false,
}

function faceBand([start, end]: Interval, y: number) {
  const from = worldToScreen({ x: start, y }, VIEWPORT)
  const to = worldToScreen({ x: end, y }, VIEWPORT)
  return { from: [from.x, from.y], to: [to.x, to.y] }
}

function recordedBands(recorder: ReturnType<typeof recordingContext>, color: string) {
  return recorder.segments
    .filter(({ style }) => style === color)
    .map(({ from, to }) => (from[0] < to[0] ? { from, to } : { from: to, to: from }))
    .sort((a, b) => a.from[0] - b.from[0])
}

interface PlanCase {
  label: string
  walls: WallSceneNode[]
  openings?: DrawableOpening[]
  sage: readonly Interval[]
  plum: readonly Interval[]
}

it('paints only the wall that owns each stretch, with the owner finish stopping at its jambs', () => {
  const first = paintedWall('first', [0, 4000], 120)
  const copy = paintedWall('second', [4000, 0], 300)
  const cases: PlanCase[] = [
    {
      label: 'unoverlapped finishes',
      walls: [first, paintedWall('second', [7000, 6000], 300)],
      sage: [[0, 4000]],
      plum: [[6000, 7000]],
    },
    {
      label: 'a doorway on the owner over a fully covered wall',
      walls: [first, copy],
      openings: [doorway],
      sage: [
        [0, 2200],
        [2800, 4000],
      ],
      plum: [],
    },
    {
      label: 'first wall in the floor order is reversed',
      walls: [copy, first],
      sage: [],
      plum: [[0, 4000]],
    },
    {
      label: 'the later wall extends beyond both ends of the first',
      walls: [first, paintedWall('second', [5000, -1000], 300)],
      sage: [[0, 4000]],
      plum: [
        [-1000, 0],
        [4000, 5000],
      ],
    },
  ]

  for (const { label, walls, openings, sage, plum } of cases) {
    const recorder = recordingContext()
    drawPlan(recorder.ctx, {
      walls,
      viewport: VIEWPORT,
      width: 1200,
      height: 600,
      selectedIds: new Set(),
      ...(openings === undefined ? {} : { openings }),
      surfacePaint: {
        activeSurface: null,
        treatmentForFace: (wallId, side) => (side === 'left' ? FINISHES.get(wallId) : undefined),
      },
    })

    expect
      .soft(recordedBands(recorder, SAGE), label)
      .toEqual(sage.map((span) => faceBand(span, 60)))
    expect
      .soft(recordedBands(recorder, PLUM), label)
      .toEqual(plum.map((span) => faceBand(span, -150)))
  }
})

interface HighlightCase {
  label: string
  walls: WallSceneNode[]
  wallId: string
  openings?: DrawableOpening[]
  centerline: readonly Interval[]
  face: { y: number; intervals: readonly Interval[] }
}

it('highlights only exposed wall stretches and leaves the doorway clear on the marked face', () => {
  const first = paintedWall('first', [0, 4000], 120)
  const copy = paintedWall('second', [4000, 0], 300)
  const tails: readonly Interval[] = [
    [-1000, 0],
    [4000, 5000],
  ]
  const cases: HighlightCase[] = [
    {
      label: 'the fully covered wall',
      walls: [first, copy],
      wallId: 'second',
      centerline: [],
      face: { y: -150, intervals: [] },
    },
    {
      label: 'both exposed tails of the later wall',
      walls: [first, paintedWall('second', [5000, -1000], 300)],
      wallId: 'second',
      centerline: tails,
      face: { y: -150, intervals: tails },
    },
    {
      label: 'the owner face at its doorway',
      walls: [first, copy],
      openings: [doorway],
      wallId: 'first',
      centerline: [[0, 4000]],
      face: {
        y: 60,
        intervals: [
          [0, 2200],
          [2800, 4000],
        ],
      },
    },
  ]

  for (const { label, walls, wallId, openings, centerline, face } of cases) {
    const recorder = recordingContext()
    const surface = { kind: 'wall-face', wallId, side: 'left' } as const
    drawPlan(recorder.ctx, {
      walls,
      viewport: VIEWPORT,
      width: 1200,
      height: 600,
      selectedIds: new Set(),
      ...(openings === undefined ? {} : { openings }),
      surfacePaint: {
        activeSurface: surface,
        highlightedSurface: surface,
        treatmentForFace: () => undefined,
      },
    })

    const accents = recordedBands(recorder, '#b5894a')
    expect.soft(accents, label).toHaveLength(centerline.length + face.intervals.length)
    const onCenter = accents.filter(
      ({ from, to }) => from[1] === VIEWPORT.offset.y && to[1] === VIEWPORT.offset.y,
    )
    const onFace = accents.filter(
      ({ from, to }) => from[1] !== VIEWPORT.offset.y && to[1] !== VIEWPORT.offset.y,
    )
    expect.soft(onCenter, label).toEqual(centerline.map((interval) => faceBand(interval, 0)))
    expect.soft(onFace, label).toEqual(face.intervals.map((interval) => faceBand(interval, face.y)))
  }
})
