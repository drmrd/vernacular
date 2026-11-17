import { describe, it, expect } from 'vitest'
import {
  openingFill,
  HUNG_SASH_TRACK_OFFSET_MM,
  type HungSash,
  type OpeningFillPart,
} from './opening-fill'
import { baseOpening, hungWindow, sashParts } from './opening-fill-test-fixtures'

/** A 90 mm wall halves to a 45 mm sash, 22.5 mm off the centerline. */
const NINETY_MM_WALL = 90
const NINETY_MM_WALL_OFFSET = 22.5
const SINGLE_HUNG_LOWER_PART_COUNT = 6
const SINGLE_HUNG_UPPER_PART_COUNT = 3

const expectSash = (parts: ReadonlyArray<OpeningFillPart>, sash: HungSash, offset: number) => {
  expect(parts.map((p) => [p.sash, p.acrossOffset])).toEqual(parts.map(() => [sash, offset]))
}

describe('openingFill hung-window sashes follow the room side of the opening', () => {
  it('puts the lower sash on the negative side when the room side is negative and the window faces positive', () => {
    const window = {
      ...hungWindow('double-hung-window', 'positive'),
      roomSide: 'negative' as const,
    }

    expectSash(sashParts(window, 'lower'), 'lower', -HUNG_SASH_TRACK_OFFSET_MM)
    expectSash(sashParts(window, 'upper'), 'upper', HUNG_SASH_TRACK_OFFSET_MM)
  })

  it('puts the lower sash on the positive side when the room side is positive and the window faces negative', () => {
    const window = {
      ...hungWindow('double-hung-window', 'negative'),
      roomSide: 'positive' as const,
    }

    expectSash(sashParts(window, 'lower'), 'lower', HUNG_SASH_TRACK_OFFSET_MM)
    expectSash(sashParts(window, 'upper'), 'upper', -HUNG_SASH_TRACK_OFFSET_MM)
  })

  it.each([
    ['positive', HUNG_SASH_TRACK_OFFSET_MM],
    ['negative', -HUNG_SASH_TRACK_OFFSET_MM],
  ] as const)(
    'keeps the lower sash on the %s side when the room side and the facing agree',
    (side, offset) => {
      const window = { ...hungWindow('double-hung-window', side), roomSide: side }

      expectSash(sashParts(window, 'lower'), 'lower', offset)
      expectSash(sashParts(window, 'upper'), 'upper', -offset)
    },
  )

  it('keeps the half-depth offset of a 90 mm wall on the room side when the window faces the other way', () => {
    const window = {
      ...hungWindow('double-hung-window', 'negative'),
      hostThickness: NINETY_MM_WALL,
      roomSide: 'positive' as const,
    }

    expectSash(sashParts(window, 'lower'), 'lower', NINETY_MM_WALL_OFFSET)
    expectSash(sashParts(window, 'upper'), 'upper', -NINETY_MM_WALL_OFFSET)
  })

  it('puts the lower and upper parts of a single-hung window on the tracks of its room side', () => {
    const window = {
      ...hungWindow('single-hung-window', 'positive'),
      roomSide: 'negative' as const,
    }

    expect(sashParts(window, 'lower')).toHaveLength(SINGLE_HUNG_LOWER_PART_COUNT)
    expectSash(sashParts(window, 'lower'), 'lower', -HUNG_SASH_TRACK_OFFSET_MM)
    expect(sashParts(window, 'upper')).toHaveLength(SINGLE_HUNG_UPPER_PART_COUNT)
    expectSash(sashParts(window, 'upper'), 'upper', HUNG_SASH_TRACK_OFFSET_MM)
  })

  it('leaves a door, a picture window, and a sliding window without a sash or a track', () => {
    const others = [baseOpening, hungWindow('picture-window'), hungWindow('sliding-window')].map(
      (opening) => ({ ...opening, roomSide: 'negative' as const }),
    )

    for (const part of others.flatMap((opening) => openingFill(opening))) {
      expect(Object.keys(part)).not.toContain('sash')
      expect(Object.keys(part)).not.toContain('acrossOffset')
    }
  })
})
