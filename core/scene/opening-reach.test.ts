import { describe, expect, it } from 'vitest'

import type { OpeningSceneNode } from './scene-graph'
import type { Vector3 } from './vector3'
import { openingUnderReach } from './opening-reach'

// A door whose wall runs along world X at world Z = 2000 (plan y maps to world z).
// The leaf rectangle spans 900mm along the wall and 2032mm tall from the floor.
function doorAtZ2000(id: string): OpeningSceneNode {
  return {
    id,
    kind: 'opening',
    floorId: 'floor-1',
    type: 'single-swing-door',
    center: { x: 1000, y: 2000 },
    along: { x: 1, y: 0 },
    normal: { x: 0, y: 1 },
    width: 900,
    height: 2032,
    sillHeight: 0,
    hostThickness: 120,
    orientation: { hinge: 'start', facing: 'positive' },
    hostWallId: 'south',
  }
}

const REACH_MM = 1500

// An eye 1000mm in front of the door (world z = 1000) at standing height.
const eyeFacingDoor: Vector3 = { x: 1000, y: 1700, z: 1000 }
const towardDoor: Vector3 = { x: 0, y: 0, z: 1 }

describe('openingUnderReach', () => {
  it('returns the opening the walker looks at within reach', () => {
    const door = doorAtZ2000('opening:front-door')

    const hit = openingUnderReach(eyeFacingDoor, towardDoor, [door], { reachMm: REACH_MM })

    expect(hit).toBe('opening:front-door')
  })

  it('returns null when the walker looks away from the opening', () => {
    const door = doorAtZ2000('opening:front-door')

    const hit = openingUnderReach(eyeFacingDoor, { x: 0, y: 0, z: -1 }, [door], {
      reachMm: REACH_MM,
    })

    expect(hit).toBeNull()
  })

  it('returns null when the opening sits beyond the reach distance', () => {
    const door = doorAtZ2000('opening:front-door')
    // Stand 2000mm back, past the 1500mm reach, still aimed at the door.
    const farEye: Vector3 = { x: 1000, y: 1700, z: 0 }

    const hit = openingUnderReach(farEye, towardDoor, [door], { reachMm: REACH_MM })

    expect(hit).toBeNull()
  })

  it('returns null when the ray passes wide of the opening rectangle', () => {
    const door = doorAtZ2000('opening:front-door')
    // Aimed at the wall but 2000mm to the side of the 900mm-wide leaf.
    const offToTheSide: Vector3 = { x: 3000, y: 1700, z: 1000 }

    const hit = openingUnderReach(offToTheSide, towardDoor, [door], { reachMm: REACH_MM })

    expect(hit).toBeNull()
  })

  it('picks the nearer opening when two line up along the ray', () => {
    const near = doorAtZ2000('opening:near-door')
    const far: OpeningSceneNode = {
      ...doorAtZ2000('opening:far-door'),
      center: { x: 1000, y: 2400 },
    }

    const hit = openingUnderReach(eyeFacingDoor, towardDoor, [far, near], { reachMm: REACH_MM })

    expect(hit).toBe('opening:near-door')
  })

  it('tests a hinge door at its swung-open position when openness is set', () => {
    const door = doorAtZ2000('opening:front-door')

    // SHUT, the leaf lies in the world plane z = 2000, its rectangle centered at
    // world {x:1000, y:1016, z:2000}, face normal {0,0,1}.
    // A full quarter-turn swing pivots the leaf about the vertical axis through
    // the hinge jamb at world {x:550, y:0, z:2000}. At openness 1 the leaf stands
    // in the world plane x = 550, centered at world {x:550, y:1016, z:1550}, face
    // normal {1,0,0}, spanning z in [1100, 2000] and y in [0, 2032].
    const eye: Vector3 = { x: -500, y: 1700, z: 1550 }
    const dir: Vector3 = { x: 1, y: 0, z: 0 }
    // This ray crosses the OPEN leaf plane (x=550) at distance 1050mm (within the
    // 1500mm reach) inside the leaf rectangle, but runs exactly parallel to the
    // shut aperture plane (z=2000), so the shut leaf is missed.

    expect(openingUnderReach(eye, dir, [door], { reachMm: REACH_MM })).toBeNull()

    expect(
      openingUnderReach(eye, dir, [door], {
        openness: new Map([['opening:front-door', 1]]),
        reachMm: REACH_MM,
      }),
    ).toBe('opening:front-door')
  })
})
