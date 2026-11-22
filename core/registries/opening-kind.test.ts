import { describe, expect, it } from 'vitest'

import { openingMotion } from '../scene/opening-motion'
import type { OpeningSceneNode } from '../scene/scene-graph'

import { builtinElementTypes } from './element-types'
import { doorFamilyOfType, openingKindOfType, openingTypeHasHingeSide } from './opening-kind'

describe('openingKindOfType', () => {
  it('classifies the split operable windows as windows', () => {
    for (const id of ['double-hung-window', 'single-hung-window', 'sliding-window']) {
      expect(openingKindOfType(id)).toBe('window')
    }
  })

  it('keeps the sliding and pocket doors classified as doors after the split', () => {
    for (const id of ['pocket-door', 'sliding-glass-door', 'bypass-door', 'barn-door']) {
      expect(openingKindOfType(id)).toBe('door')
    }
  })
})

describe('doorFamilyOfType', () => {
  it.each([
    ['single-swing-door', 'swing'],
    ['french-door', 'swing'],
    ['pivot-door', 'pivot'],
    ['sliding-glass-door', 'slide'],
    ['bypass-door', 'slide'],
    ['barn-door', 'slide'],
    ['pocket-door', 'slide'],
    ['bifold-door', 'fold'],
    ['cased-opening', 'cased'],
  ])('gives the %s the %s family', (typeId, family) => {
    expect(doorFamilyOfType(typeId)).toBe(family)
  })

  it('gives a window type and an unknown id no door family', () => {
    expect(doorFamilyOfType('double-hung-window')).toBeUndefined()
    expect(doorFamilyOfType('no-such-type')).toBeUndefined()
  })
})

const HINGED_FAMILIES = new Set(['swing', 'fold', 'pivot'])

const openingTypes = Object.values(builtinElementTypes.entries).filter(
  (entry) => entry.opening !== undefined,
)

function hasHingeSideByRule(entry: (typeof openingTypes)[number]): boolean {
  const { family, hingeEdge } = entry.opening!
  return HINGED_FAMILIES.has(family) || (family === 'window-crank' && hingeEdge === 'jamb')
}

function openingNode(type: string, hinge: 'start' | 'end'): OpeningSceneNode {
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
    orientation: { hinge, facing: 'positive' },
    hostWallId: 'wall-1',
  }
}

describe('openingTypeHasHingeSide', () => {
  it('finds at least one opening type to check', () => {
    expect(openingTypes.length).toBeGreaterThan(0)
  })

  it.each(openingTypes.map((entry) => [entry.id, hasHingeSideByRule(entry)] as const))(
    'answers %s with the hinge rule for its family (%s)',
    (typeId, expected) => {
      expect(openingTypeHasHingeSide(typeId)).toBe(expected)
    },
  )

  it.each([
    ['the casement window', 'casement-window', true],
    ['a fold door', 'bifold-door', true],
    ['a pivot door', 'pivot-door', true],
    ['an awning window', 'awning-window', false],
    ['a hopper window', 'hopper-window', false],
    ['a double-hung window', 'double-hung-window', false],
    ['a pocket door', 'pocket-door', false],
    ['an unknown type id', 'no-such-type', false],
  ])('answers %s with %s', (_label, typeId, expected) => {
    expect(openingTypeHasHingeSide(typeId)).toBe(expected)
  })

  it('leaves no crank window without a jamb hinge edge answering true', () => {
    const cranks = openingTypes.filter((entry) => entry.opening!.family === 'window-crank')
    const nonJamb = cranks.filter((entry) => entry.opening!.hingeEdge !== 'jamb')
    expect(nonJamb.length).toBeGreaterThan(0)
    for (const entry of nonJamb) {
      expect(openingTypeHasHingeSide(entry.id)).toBe(false)
    }
  })

  it.each(openingTypes.map((entry) => entry.id))(
    'moves %s differently when its hinge flips only if it has a hinge side',
    (typeId) => {
      const atStart = openingMotion(typeId, openingNode(typeId, 'start'))
      const atEnd = openingMotion(typeId, openingNode(typeId, 'end'))
      expect(JSON.stringify(atStart) !== JSON.stringify(atEnd)).toBe(
        openingTypeHasHingeSide(typeId),
      )
    },
  )
})
