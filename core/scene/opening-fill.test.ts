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

describe('openingFill', () => {
  it('fills a single door with one reveal-inset leaf at the door-leaf thickness', () => {
    const doorNode: OpeningSceneNode = {
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

    const parts = openingFill(doorNode)

    expect(parts).toEqual([
      {
        role: 'leaf',
        along: { min: -450 + LEAF_REVEAL_GAP_MM, max: 450 - LEAF_REVEAL_GAP_MM },
        up: { min: LEAF_REVEAL_GAP_MM, max: 2032 - LEAF_REVEAL_GAP_MM },
        thickness: DOOR_LEAF_THICKNESS_MM,
      },
    ])
  })

  it('fills a double door with two leaves splitting the inset width at the opening center', () => {
    const doubleDoorNode: OpeningSceneNode = {
      id: 'opening-2',
      kind: 'opening',
      floorId: 'floor-1',
      type: 'double-swing-door',
      center: { x: 1000, y: 0 },
      along: { x: 1, y: 0 },
      normal: { x: 0, y: 1 },
      width: 1626,
      height: 2032,
      sillHeight: 0,
      hostThickness: 120,
      orientation: { hinge: 'start', facing: 'positive' },
      hostWallId: 'south',
    }

    expect(openingFill(doubleDoorNode)).toEqual([
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
    const windowNode: OpeningSceneNode = {
      id: 'opening-3',
      kind: 'opening',
      floorId: 'floor-1',
      type: 'double-hung-window',
      center: { x: 1000, y: 0 },
      along: { x: 1, y: 0 },
      normal: { x: 0, y: 1 },
      width: 900,
      height: 1200,
      sillHeight: 900,
      hostThickness: 120,
      orientation: { hinge: 'start', facing: 'positive' },
      hostWallId: 'south',
    }

    const parts = openingFill(windowNode)

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
})
