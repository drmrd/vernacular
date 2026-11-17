import { describe, it, expect } from 'vitest'
import type { OpeningSceneNode } from './scene-graph'
import {
  openingFill,
  LEAF_REVEAL_GAP_MM,
  DOOR_LEAF_THICKNESS_MM,
  SASH_FRAME_WIDTH_MM,
  SASH_FRAME_THICKNESS_MM,
  GLASS_THICKNESS_MM,
  HUNG_SASH_TRACK_OFFSET_MM,
  type HungSash,
  type OpeningFillPart,
} from './opening-fill'
import { baseOpening, hungWindow, sashParts } from './opening-fill-test-fixtures'

describe('openingFill', () => {
  it('fills a single door with one reveal-inset leaf at the door-leaf thickness', () => {
    expect(openingFill(baseOpening)).toEqual([
      {
        role: 'leaf',
        along: { min: -450 + LEAF_REVEAL_GAP_MM, max: 450 - LEAF_REVEAL_GAP_MM },
        up: { min: LEAF_REVEAL_GAP_MM, max: 2032 - LEAF_REVEAL_GAP_MM },
        thickness: DOOR_LEAF_THICKNESS_MM,
      },
    ])
  })

  it('fills a double door with two leaves splitting the inset width at the opening center', () => {
    const doubleDoor: OpeningSceneNode = { ...baseOpening, type: 'double-swing-door', width: 1626 }

    expect(openingFill(doubleDoor)).toEqual([
      {
        role: 'leaf',
        along: { min: -813 + LEAF_REVEAL_GAP_MM, max: 0 },
        up: { min: LEAF_REVEAL_GAP_MM, max: 2032 - LEAF_REVEAL_GAP_MM },
        thickness: DOOR_LEAF_THICKNESS_MM,
      },
      {
        role: 'leaf',
        along: { min: 0, max: 813 - LEAF_REVEAL_GAP_MM },
        up: { min: LEAF_REVEAL_GAP_MM, max: 2032 - LEAF_REVEAL_GAP_MM },
        thickness: DOOR_LEAF_THICKNESS_MM,
      },
    ])
  })

  it('fills a fixed window with four sash bars framing one glass pane', () => {
    const window: OpeningSceneNode = {
      ...baseOpening,
      type: 'picture-window',
      width: 900,
      height: 1200,
      sillHeight: 900,
    }

    const parts = openingFill(window)

    expect(parts).toHaveLength(5)
    expect(parts).toEqual(
      expect.arrayContaining([
        // head bar
        {
          role: 'leaf',
          along: { min: -450, max: 450 },
          up: { min: 2100 - SASH_FRAME_WIDTH_MM, max: 2100 },
          thickness: SASH_FRAME_THICKNESS_MM,
        },
        // sill bar
        {
          role: 'leaf',
          along: { min: -450, max: 450 },
          up: { min: 900, max: 900 + SASH_FRAME_WIDTH_MM },
          thickness: SASH_FRAME_THICKNESS_MM,
        },
        // left jamb bar
        {
          role: 'leaf',
          along: { min: -450, max: -450 + SASH_FRAME_WIDTH_MM },
          up: { min: 900 + SASH_FRAME_WIDTH_MM, max: 2100 - SASH_FRAME_WIDTH_MM },
          thickness: SASH_FRAME_THICKNESS_MM,
        },
        // right jamb bar
        {
          role: 'leaf',
          along: { min: 450 - SASH_FRAME_WIDTH_MM, max: 450 },
          up: { min: 900 + SASH_FRAME_WIDTH_MM, max: 2100 - SASH_FRAME_WIDTH_MM },
          thickness: SASH_FRAME_THICKNESS_MM,
        },
        // glass pane (inside the frame band on all four sides)
        {
          role: 'glass',
          along: { min: -450 + SASH_FRAME_WIDTH_MM, max: 450 - SASH_FRAME_WIDTH_MM },
          up: { min: 900 + SASH_FRAME_WIDTH_MM, max: 2100 - SASH_FRAME_WIDTH_MM },
          thickness: GLASS_THICKNESS_MM,
        },
      ]),
    )
    expect(parts.filter((p) => p.role === 'leaf')).toHaveLength(4)
    expect(parts.filter((p) => p.role === 'glass')).toHaveLength(1)
  })

  it('fills a hung window as two stacked sashes split by a meeting rail', () => {
    for (const type of ['double-hung-window', 'single-hung-window'] as const) {
      const window: OpeningSceneNode = {
        ...baseOpening,
        type,
        width: 900,
        height: 1200,
        sillHeight: 900,
      }

      const parts = openingFill(window)
      const glass = parts.filter((p) => p.role === 'glass')

      // Two stacked panes, one per sash, that do not overlap in height.
      expect(glass).toHaveLength(2)
      const lowerPaneTop = Math.min(...glass.map((p) => p.up.max))
      const upperPaneBottom = Math.max(...glass.map((p) => p.up.min))
      expect(lowerPaneTop).toBeLessThanOrEqual(upperPaneBottom)

      // A full-width meeting rail straddles the midpoint, sitting in the gap between the panes.
      const midpoint = window.sillHeight + window.height / 2
      const rail = parts.find(
        (p) =>
          p.role === 'leaf' &&
          p.along.min === -(window.width / 2) &&
          p.along.max === window.width / 2 &&
          p.up.min < midpoint &&
          p.up.max > midpoint,
      )
      expect(rail).toBeDefined()
      expect(rail?.up.min).toBeGreaterThanOrEqual(lowerPaneTop)
      expect(rail?.up.max).toBeLessThanOrEqual(upperPaneBottom)
    }
  })

  it('renders no body for an opening whose type omits a fill or is unrecognized', () => {
    // A cased opening's element type omits a `fill`, so it contributes no body.
    expect(openingFill({ ...baseOpening, type: 'cased-opening' })).toEqual([])
    // A type absent from the registry also contributes no body.
    expect(openingFill({ ...baseOpening, type: 'not-a-real-type' })).toEqual([])
  })
})

describe('openingFill hung-window sash operability', () => {
  it('marks the upper sash as fixed for a single-hung window, unlike a double-hung window', () => {
    const sashFixedFlags = (
      type: 'single-hung-window' | 'double-hung-window',
    ): { upperFixed: boolean | undefined; lowerFixed: boolean | undefined } => {
      const window: OpeningSceneNode = {
        ...baseOpening,
        type,
        width: 900,
        height: 1200,
        sillHeight: 900,
      }

      const parts: ReadonlyArray<OpeningFillPart> = openingFill(window)
      const glass = parts.filter((p) => p.role === 'glass')
      const midpoint = window.sillHeight + window.height / 2
      const upperGlass = glass.find((p) => p.up.min >= midpoint)
      const lowerGlass = glass.find((p) => p.up.min < midpoint)

      return { upperFixed: upperGlass?.fixed, lowerFixed: lowerGlass?.fixed }
    }

    // A double-hung window keeps both sashes operable: today's behavior, unchanged.
    expect(sashFixedFlags('double-hung-window')).toEqual({
      upperFixed: undefined,
      lowerFixed: undefined,
    })
    // A single-hung window fixes its upper sash; only the lower sash remains operable.
    expect(sashFixedFlags('single-hung-window')).toEqual({
      upperFixed: true,
      lowerFixed: undefined,
    })
  })
})

describe('openingFill hung-window fixed-sash geometry', () => {
  it("widens the single-hung window's fixed upper pane past its own sash jambs, unlike a double-hung window", () => {
    const upperSashParts = (
      type: 'single-hung-window' | 'double-hung-window',
    ): ReadonlyArray<OpeningFillPart> => {
      const window: OpeningSceneNode = {
        ...baseOpening,
        type,
        width: 900,
        height: 1200,
        sillHeight: 900,
      }

      // The void splits into two equal sashes around a shared meeting-rail band one
      // sash-frame width tall, so each sash's own frame starts this far from the head.
      const head = window.sillHeight + window.height
      const upperSashBottom = head - (window.height - SASH_FRAME_WIDTH_MM) / 2

      return openingFill(window).filter((p) => p.up.min >= upperSashBottom)
    }

    // A double-hung window's upper sash keeps its own jambs, inset by one sash-frame
    // width on either side of the glass: today's behavior, unchanged.
    const double = upperSashParts('double-hung-window')
    expect(double.filter((p) => p.role === 'leaf')).toHaveLength(4)
    expect(double.filter((p) => p.role === 'glass')).toHaveLength(1)
    expect(double).toEqual(
      expect.arrayContaining([
        {
          role: 'leaf',
          along: { min: -450, max: -390 },
          up: { min: 1590, max: 2040 },
          thickness: SASH_FRAME_THICKNESS_MM,
          sash: 'upper',
          acrossOffset: -HUNG_SASH_TRACK_OFFSET_MM,
        },
        {
          role: 'leaf',
          along: { min: 390, max: 450 },
          up: { min: 1590, max: 2040 },
          thickness: SASH_FRAME_THICKNESS_MM,
          sash: 'upper',
          acrossOffset: -HUNG_SASH_TRACK_OFFSET_MM,
        },
        {
          role: 'glass',
          along: { min: -390, max: 390 },
          up: { min: 1590, max: 2040 },
          thickness: GLASS_THICKNESS_MM,
          sash: 'upper',
          acrossOffset: -HUNG_SASH_TRACK_OFFSET_MM,
        },
      ]),
    )

    // A single-hung window's fixed upper sash carries no sash jambs of its own: the
    // pane is set straight into the outer frame, spanning the full opening width, and
    // stays fixed shut per cycle 1's contract.
    const single = upperSashParts('single-hung-window')
    expect(single).toHaveLength(3)
    expect(single.filter((p) => p.role === 'leaf')).toHaveLength(2)
    expect(single).toEqual(
      expect.arrayContaining([
        {
          role: 'leaf',
          along: { min: -450, max: 450 },
          up: { min: 1530, max: 1590 },
          thickness: SASH_FRAME_THICKNESS_MM,
          sash: 'upper',
          acrossOffset: -HUNG_SASH_TRACK_OFFSET_MM,
        },
        {
          role: 'leaf',
          along: { min: -450, max: 450 },
          up: { min: 2040, max: 2100 },
          thickness: SASH_FRAME_THICKNESS_MM,
          sash: 'upper',
          acrossOffset: -HUNG_SASH_TRACK_OFFSET_MM,
        },
        {
          role: 'glass',
          along: { min: -450, max: 450 },
          up: { min: 1590, max: 2040 },
          thickness: GLASS_THICKNESS_MM,
          fixed: true,
          sash: 'upper',
          acrossOffset: -HUNG_SASH_TRACK_OFFSET_MM,
        },
      ]),
    )
  })
})

describe('openingFill hung-window sash tracks', () => {
  const expectSash = (parts: ReadonlyArray<OpeningFillPart>, sash: HungSash, offset: number) => {
    expect(parts.map((p) => [p.sash, p.acrossOffset])).toEqual(parts.map(() => [sash, offset]))
  }

  it('names the sash of every part of a double-hung window and sets the sashes on two tracks', () => {
    const window = hungWindow('double-hung-window')
    const meetingRail = openingFill(window).find((p) => p.up.min === 1470 && p.up.max === 1530)

    expect(openingFill(window).every((p) => p.sash !== undefined)).toBe(true)
    expect(sashParts(window, 'lower')).toHaveLength(6)
    expectSash(sashParts(window, 'lower'), 'lower', HUNG_SASH_TRACK_OFFSET_MM)
    expect(sashParts(window, 'upper')).toHaveLength(5)
    expectSash(sashParts(window, 'upper'), 'upper', -HUNG_SASH_TRACK_OFFSET_MM)
    expect(meetingRail?.sash).toBe('lower')
  })

  it('splits a single-hung window into a lower sash of six parts and an upper sash of three', () => {
    const window = hungWindow('single-hung-window')

    expect(sashParts(window, 'lower')).toHaveLength(6)
    expectSash(sashParts(window, 'lower'), 'lower', HUNG_SASH_TRACK_OFFSET_MM)
    expect(sashParts(window, 'upper')).toHaveLength(3)
    expectSash(sashParts(window, 'upper'), 'upper', -HUNG_SASH_TRACK_OFFSET_MM)
  })

  it('swaps the two tracks when the window faces the negative side', () => {
    const window = hungWindow('double-hung-window', 'negative')

    expectSash(sashParts(window, 'lower'), 'lower', -HUNG_SASH_TRACK_OFFSET_MM)
    expectSash(sashParts(window, 'upper'), 'upper', HUNG_SASH_TRACK_OFFSET_MM)
  })

  it('leaves the parts of a door, a picture window, and a sliding window without a sash or a track', () => {
    const others = [baseOpening, hungWindow('picture-window'), hungWindow('sliding-window')]

    for (const part of others.flatMap((opening) => openingFill(opening))) {
      expect(Object.keys(part)).not.toContain('sash')
      expect(Object.keys(part)).not.toContain('acrossOffset')
    }
  })
})
