import { describe, expect, it } from 'vitest'

import {
  ELEMENT_TYPE_REGISTRY_VERSION,
  builtinElementTypes,
  type ElementType,
} from '../registries/element-types'

import { openingMotion } from './opening-motion'
import type { OpeningSceneNode } from './scene-graph'

const PRECISION = 6
const KNOWN_KINDS = new Set(['hinge', 'slide', 'none'])
const QUARTER_TURN = Math.PI / 2

/** A wall-along-+X opening centered at the origin, hinged at its start jamb. */
function openingNode(type: string, overrides: Partial<OpeningSceneNode> = {}): OpeningSceneNode {
  return {
    id: `opening:${type}`,
    kind: 'opening',
    floorId: 'floor-1',
    type,
    center: { x: 0, y: 0 },
    along: { x: 1, y: 0 },
    normal: { x: 0, y: 1 },
    width: 900,
    height: 2000,
    sillHeight: 0,
    hostThickness: 120,
    orientation: { hinge: 'start', facing: 'positive' },
    hostWallId: 'wall-1',
    ...overrides,
  }
}

function nodeForType(entry: ElementType): OpeningSceneNode {
  return openingNode(entry.id, {
    width: entry.opening?.defaultWidth ?? 900,
    height: entry.opening?.defaultHeight ?? 2000,
    sillHeight: entry.opening?.defaultSillHeight ?? 0,
  })
}

describe('openingMotion swing doors', () => {
  it('resolves a swing door to a jamb hinge on its oriented start side', () => {
    const motion = openingMotion('single-swing-door', openingNode('single-swing-door'))

    expect(motion.kind).toBe('hinge')
    if (motion.kind !== 'hinge') return
    expect(motion.edge).toBe('jamb')
    // Start jamb: half a width back along the wall, at the floor line.
    expect(motion.pivot).toEqual({ x: -450, y: 0, z: 0 })
    // Vertical (world Y) hinge axis, the way a door turns on its hinges.
    expect(motion.axis).toEqual({ x: 0, y: 1, z: 0 })
    // The axis map is orientation-preserving, so a positive-facing swing turns the
    // negative way about world +Y to read as the same plan-space turn (see the
    // openAngle note in opening-motion.ts).
    expect(motion.openAngle).toBeCloseTo(-QUARTER_TURN, PRECISION)
    expect(motion.partCount).toBe(1)
  })

  it('hinges on the end jamb and reverses for a negative facing', () => {
    const motion = openingMotion(
      'single-swing-door',
      openingNode('single-swing-door', {
        orientation: { hinge: 'end', facing: 'negative' },
      }),
    )

    expect(motion.kind).toBe('hinge')
    if (motion.kind !== 'hinge') return
    expect(motion.pivot).toEqual({ x: 450, y: 0, z: 0 })
    // Negative facing reverses the swing; under the orientation-preserving map that
    // reads as a positive turn about world +Y (see openAngle note in opening-motion.ts).
    expect(motion.openAngle).toBeCloseTo(QUARTER_TURN, PRECISION)
  })

  it('reports two moving parts for a double door', () => {
    const motion = openingMotion('double-swing-door', openingNode('double-swing-door'))

    expect(motion.kind).toBe('hinge')
    if (motion.kind !== 'hinge') return
    expect(motion.partCount).toBe(2)
  })
})

describe('openingMotion sliding doors', () => {
  it('resolves a pocket door to a slide along the wall', () => {
    const motion = openingMotion('pocket-door', openingNode('pocket-door'))

    expect(motion.kind).toBe('slide')
    if (motion.kind !== 'slide') return
    expect(motion.axis).toBe('along-wall')
    // Travels a full opening width along the wall (+x here), level and in plane.
    expect(motion.travel).toEqual({ x: 900, y: 0, z: 0 })
    expect(motion.partCount).toBe(1)
  })
})

describe('openingMotion windows', () => {
  it('resolves a double-hung window to a vertical slide of both sashes', () => {
    const motion = openingMotion('double-hung-window', openingNode('double-hung-window'))

    expect(motion.kind).toBe('slide')
    if (motion.kind !== 'slide') return
    expect(motion.axis).toBe('vertical')
    // Raises straight up (world +Y) by the opening height; no in-plane travel.
    expect(motion.travel).toEqual({ x: 0, y: 2000, z: 0 })
    expect(motion.partCount).toBe(2)
  })

  it('resolves a sliding window to a slide along the wall', () => {
    const motion = openingMotion('sliding-window', openingNode('sliding-window'))

    expect(motion.kind).toBe('slide')
    if (motion.kind !== 'slide') return
    expect(motion.axis).toBe('along-wall')
    expect(motion.travel).toEqual({ x: 900, y: 0, z: 0 })
    expect(motion.partCount).toBe(1)
  })

  it('cranks a casement window on its jamb', () => {
    const motion = openingMotion('casement-window', openingNode('casement-window'))

    expect(motion.kind).toBe('hinge')
    if (motion.kind !== 'hinge') return
    expect(motion.edge).toBe('jamb')
    expect(motion.pivot).toEqual({ x: -450, y: 0, z: 0 })
    expect(motion.axis).toEqual({ x: 0, y: 1, z: 0 })
  })

  it('cranks an awning window on its head about the along-wall axis', () => {
    const motion = openingMotion('awning-window', openingNode('awning-window'))

    expect(motion.kind).toBe('hinge')
    if (motion.kind !== 'hinge') return
    expect(motion.edge).toBe('head')
    // Pivot at the opening head (top), on the wall centerline.
    expect(motion.pivot).toEqual({ x: 0, y: 2000, z: 0 })
    // Horizontal axis running along the wall.
    expect(motion.axis).toEqual({ x: 1, y: 0, z: 0 })
  })

  it('cranks a hopper window on its sill about the along-wall axis', () => {
    const motion = openingMotion('hopper-window', openingNode('hopper-window'))

    expect(motion.kind).toBe('hinge')
    if (motion.kind !== 'hinge') return
    expect(motion.edge).toBe('sill')
    // Pivot at the opening sill (bottom), on the wall centerline.
    expect(motion.pivot).toEqual({ x: 0, y: 0, z: 0 })
    expect(motion.axis).toEqual({ x: 1, y: 0, z: 0 })
  })
})

describe('openingMotion on angled walls', () => {
  // A wall running off the axes, so along.y is nonzero and the plan-y to world -Z
  // mapping is exercised. Plan north (+y) maps to world -Z, so a plan along of
  // (0.6, 0.8) gives a world hinge axis and slide travel whose Z negates along.y.
  const angledAlong = { x: 0.6, y: 0.8 }
  const angledNormal = { x: -0.8, y: 0.6 }

  it('cranks an awning window about an along-wall axis whose Z negates along.y', () => {
    const motion = openingMotion(
      'awning-window',
      openingNode('awning-window', { along: angledAlong, normal: angledNormal }),
    )

    expect(motion.kind).toBe('hinge')
    if (motion.kind !== 'hinge') return
    expect(motion.edge).toBe('head')
    // The hinge runs along the wall: world X tracks plan x, world Z negates plan y.
    expect(motion.axis.x).toBeCloseTo(angledAlong.x, PRECISION)
    expect(motion.axis.y).toBeCloseTo(0, PRECISION)
    expect(motion.axis.z).toBeCloseTo(-angledAlong.y, PRECISION)
  })

  it('slides a sliding window along the wall with travel Z negating along.y', () => {
    const node = openingNode('sliding-window', { along: angledAlong, normal: angledNormal })
    const motion = openingMotion('sliding-window', node)

    expect(motion.kind).toBe('slide')
    if (motion.kind !== 'slide') return
    expect(motion.axis).toBe('along-wall')
    // Travels a full opening width along the wall: world X tracks plan x, world Z
    // negates plan y.
    expect(motion.travel.x).toBeCloseTo(angledAlong.x * node.width, PRECISION)
    expect(motion.travel.y).toBeCloseTo(0, PRECISION)
    expect(motion.travel.z).toBeCloseTo(-angledAlong.y * node.width, PRECISION)
  })
})

describe('openingMotion fold and pivot fallback', () => {
  it('falls back to a jamb hinge for a bifold door', () => {
    const motion = openingMotion('bifold-door', openingNode('bifold-door'))

    expect(motion.kind).toBe('hinge')
    if (motion.kind !== 'hinge') return
    expect(motion.edge).toBe('jamb')
    expect(motion.pivot).toEqual({ x: -450, y: 0, z: 0 })
  })

  it('falls back to a jamb hinge for a pivot door', () => {
    const motion = openingMotion('pivot-door', openingNode('pivot-door'))

    expect(motion.kind).toBe('hinge')
    if (motion.kind !== 'hinge') return
    expect(motion.edge).toBe('jamb')
  })
})

describe('openingMotion fixed openings', () => {
  it('resolves a cased opening to no motion', () => {
    expect(openingMotion('cased-opening', openingNode('cased-opening'))).toEqual({ kind: 'none' })
  })

  it('resolves a picture window to no motion', () => {
    expect(openingMotion('picture-window', openingNode('picture-window'))).toEqual({ kind: 'none' })
  })
})

describe('openingMotion registry coverage', () => {
  it('resolves every built-in opening type to a defined motion at version 6', () => {
    expect(ELEMENT_TYPE_REGISTRY_VERSION).toBe(6)
    const openings = Object.values(builtinElementTypes.entries).filter(
      (entry) => entry.category === 'opening',
    )
    expect(openings.length).toBeGreaterThan(0)
    for (const entry of openings) {
      const motion = openingMotion(entry.id, nodeForType(entry))
      expect(KNOWN_KINDS.has(motion.kind)).toBe(true)
    }
  })
})
