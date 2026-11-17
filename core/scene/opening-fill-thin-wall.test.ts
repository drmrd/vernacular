import { describe, it, expect } from 'vitest'
import { MIN_POSITIVE_LENGTH_MM } from '../units/length-bounds'
import {
  openingFill,
  SASH_FRAME_THICKNESS_MM,
  DOOR_LEAF_THICKNESS_MM,
  GLASS_THICKNESS_MM,
  HUNG_SASH_MIN_DEPTH_MM,
  type OpeningFillPart,
} from './opening-fill'
import { hungWindow, sashParts } from './opening-fill-test-fixtures'

/** Walls of 100 mm and more hold a full-depth sash; the fixture wall is 120 mm. */
const FIXTURE_WALL_MM = 120
const FULL_DEPTH_WALL_MM = 2 * SASH_FRAME_THICKNESS_MM
/** A 90 mm wall halves to a 45 mm sash, 22.5 mm off the centerline. */
const NINETY_MM_WALL = 90
const HALF_OF_NINETY_MM_WALL = 45
const NINETY_MM_WALL_OFFSET = 22.5
/** At 40 mm, half the wall equals the 20 mm minimum depth; the sash sits 10 mm off the centerline. */
const FORTY_MM_WALL = 40
const MIN_DEPTH_OFFSET_MM = HUNG_SASH_MIN_DEPTH_MM / 2
const SINGLE_HUNG_UPPER_PART_COUNT = 3
const SINGLE_HUNG_LOWER_PART_COUNT = 6
const GLASS_HALF_THICKNESS_MM = GLASS_THICKNESS_MM / 2
const FACE_TOLERANCE_MM = 1e-9
/** Walls just under, at, and just over each threshold of the rule, and the thin and thick extremes. */
const WALLS_MM = [1, 39, 40, 41, 72, 78, 90, 99, 100, 101, 114, 120, 300]

const windowInWall = (
  type: string,
  hostThickness: number,
  facing: 'positive' | 'negative' = 'positive',
) => ({ ...hungWindow(type, facing), hostThickness })

const isLeaf = (p: OpeningFillPart) => p.role === 'leaf'
const isGlass = (p: OpeningFillPart) => p.role === 'glass'
const outerFace = (p: OpeningFillPart) => Math.abs(p.acrossOffset ?? 0) + p.thickness / 2

/** Every leaf part is `leaf` thick and every glass part is 6 mm, on both sashes, at these offsets. */
function expectSashDepth(
  window: ReturnType<typeof windowInWall>,
  expected: { leaf: number; lowerOffset: number },
) {
  const lower = sashParts(window, 'lower')
  const upper = sashParts(window, 'upper')

  expect(lower.length + upper.length).toBe(openingFill(window).length)
  for (const [parts, offset] of [
    [lower, expected.lowerOffset],
    [upper, -expected.lowerOffset],
  ] as const) {
    expect(parts.filter(isLeaf).map((p) => p.thickness)).toEqual(
      parts.filter(isLeaf).map(() => expected.leaf),
    )
    expect(parts.filter(isGlass).map((p) => p.thickness)).toEqual(
      parts.filter(isGlass).map(() => GLASS_THICKNESS_MM),
    )
    expect(parts.map((p) => p.acrossOffset)).toEqual(parts.map(() => offset))
  }
}

describe('openingFill hung-window sashes in a thin wall', () => {
  it.each([FIXTURE_WALL_MM, FULL_DEPTH_WALL_MM])(
    'keeps the full sash depth and the track offsets in a %i mm wall',
    (wall) => {
      expectSashDepth(windowInWall('double-hung-window', wall), {
        leaf: SASH_FRAME_THICKNESS_MM,
        lowerOffset: SASH_FRAME_THICKNESS_MM / 2,
      })
    },
  )

  it('halves the sash depth in a 90 mm wall so each sash stays inside the wall faces', () => {
    const window = windowInWall('double-hung-window', NINETY_MM_WALL)

    expectSashDepth(window, { leaf: HALF_OF_NINETY_MM_WALL, lowerOffset: NINETY_MM_WALL_OFFSET })
    for (const part of openingFill(window)) {
      expect(outerFace(part)).toBeLessThanOrEqual(NINETY_MM_WALL / 2)
    }
  })

  it('builds the sashes at the minimum depth in a 40 mm wall', () => {
    expectSashDepth(windowInWall('double-hung-window', FORTY_MM_WALL), {
      leaf: HUNG_SASH_MIN_DEPTH_MM,
      lowerOffset: MIN_DEPTH_OFFSET_MM,
    })
  })

  it('keeps the minimum depth in the thinnest wall the model accepts', () => {
    expectSashDepth(windowInWall('double-hung-window', MIN_POSITIVE_LENGTH_MM), {
      leaf: HUNG_SASH_MIN_DEPTH_MM,
      lowerOffset: MIN_DEPTH_OFFSET_MM,
    })
  })

  it('puts the lower sash on the negative side of a 90 mm wall when the window faces negative', () => {
    expectSashDepth(windowInWall('double-hung-window', NINETY_MM_WALL, 'negative'), {
      leaf: HALF_OF_NINETY_MM_WALL,
      lowerOffset: -NINETY_MM_WALL_OFFSET,
    })
  })

  it('thins the sashes of a single-hung window in a 90 mm wall by the same rule', () => {
    const window = windowInWall('single-hung-window', NINETY_MM_WALL)

    expect(sashParts(window, 'upper')).toHaveLength(SINGLE_HUNG_UPPER_PART_COUNT)
    expect(sashParts(window, 'lower')).toHaveLength(SINGLE_HUNG_LOWER_PART_COUNT)
    expectSashDepth(window, { leaf: HALF_OF_NINETY_MM_WALL, lowerOffset: NINETY_MM_WALL_OFFSET })
  })

  it('leaves a picture window and a single-swing door in a 90 mm wall at their own thickness', () => {
    const pictureWindow = openingFill(windowInWall('picture-window', NINETY_MM_WALL))
    const door = openingFill(windowInWall('single-swing-door', NINETY_MM_WALL))

    expect(pictureWindow.filter(isLeaf).map((p) => p.thickness)).toEqual([
      SASH_FRAME_THICKNESS_MM,
      SASH_FRAME_THICKNESS_MM,
      SASH_FRAME_THICKNESS_MM,
      SASH_FRAME_THICKNESS_MM,
    ])
    expect(door.map((p) => p.thickness)).toEqual([DOOR_LEAF_THICKNESS_MM])
    for (const part of [...pictureWindow, ...door]) {
      expect(Object.keys(part)).not.toContain('acrossOffset')
    }
  })

  describe.each(WALLS_MM)('in a %i mm wall', (wall) => {
    const parts = openingFill(windowInWall('double-hung-window', wall))

    it('keeps the two sashes from overlapping in depth', () => {
      for (const part of sashParts(windowInWall('double-hung-window', wall), 'lower')) {
        expect((part.acrossOffset ?? 0) - part.thickness / 2).toBeGreaterThanOrEqual(0)
      }
      for (const part of sashParts(windowInWall('double-hung-window', wall), 'upper')) {
        expect((part.acrossOffset ?? 0) + part.thickness / 2).toBeLessThanOrEqual(0)
      }
    })

    it('keeps every glass face off the plane of every other part face', () => {
      parts.filter(isGlass).forEach((glass) => {
        const offset = glass.acrossOffset ?? 0
        const glassFaces = [offset - GLASS_HALF_THICKNESS_MM, offset + GLASS_HALF_THICKNESS_MM]
        const otherFaces = parts
          .filter((other) => other !== glass)
          .flatMap((o) => [
            (o.acrossOffset ?? 0) - o.thickness / 2,
            (o.acrossOffset ?? 0) + o.thickness / 2,
          ])

        for (const face of glassFaces) {
          expect(otherFaces.filter((f) => Math.abs(f - face) < FACE_TOLERANCE_MM)).toEqual([])
        }
      })
    })

    it.runIf(wall >= FORTY_MM_WALL)('keeps every part inside the wall faces', () => {
      for (const part of parts) {
        expect(outerFace(part)).toBeLessThanOrEqual(wall / 2)
      }
    })
  })
})
