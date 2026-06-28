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
    expect(motion.openAngle).toBeCloseTo(QUARTER_TURN, PRECISION)
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
    expect(motion.openAngle).toBeCloseTo(-QUARTER_TURN, PRECISION)
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

describe('openingMotion fold and pivot fallback', () => {
  it('falls back to a jamb hinge for a bifold door in wave one', () => {
    const motion = openingMotion('bifold-door', openingNode('bifold-door'))

    expect(motion.kind).toBe('hinge')
    if (motion.kind !== 'hinge') return
    expect(motion.edge).toBe('jamb')
    expect(motion.pivot).toEqual({ x: -450, y: 0, z: 0 })
  })

  it('falls back to a jamb hinge for a pivot door in wave one', () => {
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
