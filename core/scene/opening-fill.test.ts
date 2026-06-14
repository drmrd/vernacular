import { describe, it, expect } from 'vitest'
import type { OpeningSceneNode } from './scene-graph'
import {
  openingFill,
  LEAF_REVEAL_GAP_MM,
  DOOR_LEAF_THICKNESS_MM,
  SASH_FRAME_WIDTH_MM,
  SASH_FRAME_THICKNESS_MM,
  GLASS_THICKNESS_MM,
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

  it('fills a window with four sash bars framing one glass pane', () => {
    const window: OpeningSceneNode = {
      ...baseOpening,
      type: 'double-hung-window',
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

  it('renders no body for an opening whose type omits a fill or is unrecognized', () => {
    // A cased opening's element type omits a `fill`, so it contributes no body.
    expect(openingFill({ ...baseOpening, type: 'cased-opening' })).toEqual([])
    // A type absent from the registry also contributes no body.
    expect(openingFill({ ...baseOpening, type: 'not-a-real-type' })).toEqual([])
  })
})
