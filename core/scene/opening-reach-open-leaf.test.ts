import { describe, expect, it } from 'vitest'

import type { Vector3 } from './vector3'
import { openingUnderReach } from './opening-reach'
import {
  REACH_MM,
  casementAtZ2000,
  doorAtZ2000,
  doorAtZ2400,
  eyeFacingDoor,
  pocketDoorAtZ2000,
  towardDoor,
} from './opening-reach-test-support'

describe('openingUnderReach for a fully open opening', () => {
  it('reaches a fully open swing door from the pose that opened it', () => {
    const door = doorAtZ2000('opening:front-door')

    const hit = openingUnderReach(eyeFacingDoor, towardDoor, [door], {
      openness: new Map([['opening:front-door', { primary: 1 }]]),
      reachMm: REACH_MM,
    })

    expect(hit?.openingId).toBe('opening:front-door')
  })

  it('reaches a fully open pocket door head-on through its frame', () => {
    const door = pocketDoorAtZ2000('opening:pocket-door')

    const hit = openingUnderReach(eyeFacingDoor, towardDoor, [door], {
      openness: new Map([['opening:pocket-door', { primary: 1 }]]),
      reachMm: REACH_MM,
    })

    expect(hit?.openingId).toBe('opening:pocket-door')
  })

  it('reaches a fully open casement window head-on through its frame', () => {
    const window = casementAtZ2000('opening:casement')
    const eye: Vector3 = { x: 1000, y: 1700, z: -1000 }

    const hit = openingUnderReach(eye, towardDoor, [window], {
      openness: new Map([['opening:casement', { primary: 1 }]]),
      reachMm: REACH_MM,
    })

    expect(hit?.openingId).toBe('opening:casement')
  })

  it('prefers an open door in reach over a shut door behind it on the same ray', () => {
    const near = doorAtZ2000('opening:near-door')
    const far = doorAtZ2400('opening:far-door')

    const hit = openingUnderReach(eyeFacingDoor, towardDoor, [far, near], {
      openness: new Map([['opening:near-door', { primary: 1 }]]),
      reachMm: REACH_MM,
    })

    expect(hit?.openingId).toBe('opening:near-door')
  })

  it('still misses an open door when the ray runs wide of its frame and its leaf', () => {
    const door = doorAtZ2000('opening:front-door')
    const alongTheWall: Vector3 = { x: 2000, y: 1700, z: -1000 }

    const hit = openingUnderReach(alongTheWall, towardDoor, [door], {
      openness: new Map([['opening:front-door', { primary: 1 }]]),
      reachMm: REACH_MM,
    })

    expect(hit).toBeNull()
  })
})
