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

    const bandsFor = (color: string) =>
      recorder.segments
        .filter(({ style }) => style === color)
        .map(({ from, to }) => (from[0] < to[0] ? { from, to } : { from: to, to: from }))
        .sort((a, b) => a.from[0] - b.from[0])

    expect.soft(bandsFor(SAGE), label).toEqual(sage.map((span) => faceBand(span, 60)))
    expect.soft(bandsFor(PLUM), label).toEqual(plum.map((span) => faceBand(span, -150)))
  }
})
