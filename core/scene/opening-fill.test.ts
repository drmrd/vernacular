import { describe, it, expect } from 'vitest'
import type { OpeningSceneNode } from './scene-graph'
import {
  openingFill,
  LEAF_REVEAL_GAP_MM,
  DOOR_LEAF_THICKNESS_MM,
  SASH_FRAME_WIDTH_MM,
  SASH_FRAME_THICKNESS_MM,
  GLASS_THICKNESS_MM,
  type OpeningFillPart,
} from './opening-fill'

/**
 * A single-swing door centered on a wall running along +x with its normal on +y.
 * Each test overrides the type and the opening dimensions it needs.
 */
const baseOpening: OpeningSceneNode = {
  id: 'opening-1',
  kind: 'opening',
  floorId: 'floor-1',
  type: 'single-swing-door',
  center: { x: 1000, y: 0 },
  along: { x: 1, y: 0 },
  normal: { x: 0, y: 1 },
  width: 900,
  height: 2032,
  sillHeight: 0,
  hostThickness: 120,
  orientation: { hinge: 'start', facing: 'positive' },
  hostWallId: 'south',
}

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

      const parts: ReadonlyArray<OpeningFillPart & { readonly fixed?: boolean }> =
        openingFill(window)
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
