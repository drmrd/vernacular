import { describe, expect, it } from 'vitest'

import { openingMotion, openingPartMotion, openingParts } from '../index'
import { openingNode, slideMotionOf } from './opening-motion-test-support'

const DOUBLE_HUNG = 'double-hung-window'
const SINGLE_HUNG = 'single-hung-window'
const DOOR = 'single-swing-door'
const WINDOW_HEIGHT_MM = 1200
const TOO_SHORT_HEIGHT_MM = 50
const DOOR_HEIGHT_MM = 2032
/** Rise of a sash in a 1200 mm window: 1200 / 2 - 60 / 2. */
const RISE_MM = 570

function slideOf(type: string, height: number, part: 'lower' | 'upper') {
  return slideMotionOf(openingPartMotion(type, openingNode(type, height), part))
}

describe('openingParts', () => {
  it('lists the lower and the upper sash of a double-hung window', () => {
    expect(openingParts(DOUBLE_HUNG)).toEqual(['lower', 'upper'])
  })

  it('lists only the lower sash of a single-hung window, whose upper sash is fixed', () => {
    expect(openingParts(SINGLE_HUNG)).toEqual(['lower'])
  })

  it('lists one primary part for a door and for an unknown type', () => {
    expect(openingParts(DOOR)).toEqual(['primary'])
    expect(openingParts('no-such-type')).toEqual(['primary'])
  })
})

describe('openingPartMotion', () => {
  it('lowers the upper sash of a double-hung window by the rise of the lower sash', () => {
    const motion = slideOf(DOUBLE_HUNG, WINDOW_HEIGHT_MM, 'upper')

    expect(motion.axis).toBe('vertical')
    expect(motion.partId).toBe('upper')
    expect(motion.travel).toEqual({ x: 0, y: 0 - RISE_MM, z: 0 })
  })

  it('raises the lower sash by the same rise as openingMotion', () => {
    const node = openingNode(DOUBLE_HUNG, WINDOW_HEIGHT_MM)

    expect(openingPartMotion(DOUBLE_HUNG, node, 'lower')).toEqual(openingMotion(DOUBLE_HUNG, node))
    expect(slideOf(DOUBLE_HUNG, WINDOW_HEIGHT_MM, 'lower').travel.y).toBe(RISE_MM)
  })

  it('gives a zero upper travel on a window too short for a rise', () => {
    expect(slideOf(DOUBLE_HUNG, TOO_SHORT_HEIGHT_MM, 'upper').travel.y).toBe(0)
  })

  it('gives no motion to the fixed upper sash of a single-hung window', () => {
    const node = openingNode(SINGLE_HUNG, WINDOW_HEIGHT_MM)

    expect(openingPartMotion(SINGLE_HUNG, node, 'upper').kind).toBe('none')
    expect(slideOf(SINGLE_HUNG, WINDOW_HEIGHT_MM, 'lower').travel.y).toBe(RISE_MM)
  })

  it('gives the opening motion to the primary part of a door, and no motion to a part the type lacks', () => {
    const door = openingNode(DOOR, DOOR_HEIGHT_MM)
    const hung = openingNode(DOUBLE_HUNG, WINDOW_HEIGHT_MM)

    expect(openingPartMotion(DOOR, door, 'primary')).toEqual(openingMotion(DOOR, door))
    expect(openingPartMotion(DOOR, door, 'primary').kind).toBe('hinge')
    expect(openingPartMotion(DOOR, door, 'upper').kind).toBe('none')
    expect(openingPartMotion(DOUBLE_HUNG, hung, 'primary').kind).toBe('none')
  })
})
