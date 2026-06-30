import { describe, expect, it } from 'vitest'

import type { OpeningSceneNode } from './scene-graph'
import type { Vector3 } from './vector3'
import { openingUnderReach } from './opening-reach'

// A door whose wall runs along world X at world Z = -2000 (plan y maps to world -z).
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

// A pocket door on the same wall as `doorAtZ2000`. A slide ignores the
// hinge/facing orientation: opening it travels one leaf-width (`width`) along
// `along`. Geometry otherwise matches the swing-door leaf.
function pocketDoorAtZ2000(id: string): OpeningSceneNode {
  return {
    ...doorAtZ2000(id),
    type: 'pocket-door',
  }
}

// An opening on a wall running off the axes, so along.y and normal.y are nonzero
// and the plan-y to world -Z mapping is exercised. The leaf rectangle spans 900mm
// along the wall and 2000mm tall, centered at the plan origin (world {x:0, y:1000,
// z:0}).
function angledOpening(id: string): OpeningSceneNode {
  return {
    id,
    kind: 'opening',
    floorId: 'floor-1',
    type: 'single-swing-door',
    center: { x: 0, y: 0 },
    along: { x: 0.6, y: 0.8 },
    normal: { x: -0.8, y: 0.6 },
    width: 900,
    height: 2000,
    sillHeight: 0,
    hostThickness: 120,
    orientation: { hinge: 'start', facing: 'positive' },
    hostWallId: 'angled',
  }
}

const REACH_MM = 1500

// An eye 1000mm in front of the door (world z = -1000) at standing height, looking
// toward the door at world z = -2000 (plan y maps to world -z).
const eyeFacingDoor: Vector3 = { x: 1000, y: 1700, z: -1000 }
const towardDoor: Vector3 = { x: 0, y: 0, z: -1 }

describe('openingUnderReach', () => {
  it('returns the opening the walker looks at within reach', () => {
    const door = doorAtZ2000('opening:front-door')

    const hit = openingUnderReach(eyeFacingDoor, towardDoor, [door], { reachMm: REACH_MM })

    expect(hit).toBe('opening:front-door')
  })

  it('returns an opening on an angled wall viewed along its true world normal', () => {
    const opening = angledOpening('opening:bay-window')
    // Plan north (+y) maps to world -Z, so the plan normal (-0.8, 0.6) becomes the
    // true world normal (-0.8, 0, -0.6) and the world along is (0.6, 0, -0.8). The
    // leaf center sits at world {x:0, y:1000, z:0}. Stand 1000mm out along the true
    // normal, offset 400mm along the leaf (inside its 450mm half-width), and look
    // straight back: the ray crosses the leaf rectangle 1000mm out, within reach.
    // With the old mirrored (+Z) frame the same ray points away from the leaf, so
    // it is missed.
    const eye: Vector3 = { x: -560, y: 1000, z: -920 }
    const towardLeaf: Vector3 = { x: 0.8, y: 0, z: 0.6 }

    const hit = openingUnderReach(eye, towardLeaf, [opening], { reachMm: REACH_MM })

    expect(hit).toBe('opening:bay-window')
  })

  it('returns null when the walker looks away from the opening', () => {
    const door = doorAtZ2000('opening:front-door')

    const hit = openingUnderReach(eyeFacingDoor, { x: 0, y: 0, z: 1 }, [door], {
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
    const offToTheSide: Vector3 = { x: 3000, y: 1700, z: -1000 }

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

    // SHUT, the leaf lies in the world plane z = -2000, its rectangle centered at
    // world {x:1000, y:1016, z:-2000}, face normal {0,0,1}.
    // A full quarter-turn swing pivots the leaf about the vertical axis through
    // the hinge jamb at world {x:550, y:0, z:-2000}. At openness 1 the leaf stands
    // in the world plane x = 550, centered at world {x:550, y:1016, z:-1550}, face
    // normal {-1,0,0}, spanning z in [-2000, -1100] and y in [0, 2032].
    const eye: Vector3 = { x: -500, y: 1700, z: -1550 }
    const dir: Vector3 = { x: 1, y: 0, z: 0 }
    // This ray crosses the OPEN leaf plane (x=550) at distance 1050mm (within the
    // 1500mm reach) inside the leaf rectangle, but runs exactly parallel to the
    // shut aperture plane (z=-2000), so the shut leaf is missed.

    expect(openingUnderReach(eye, dir, [door], { reachMm: REACH_MM })).toBeNull()

    expect(
      openingUnderReach(eye, dir, [door], {
        openness: new Map([['opening:front-door', 1]]),
        reachMm: REACH_MM,
      }),
    ).toBe('opening:front-door')
  })

  it('tests a pocket door at its slid-open position when openness is set', () => {
    const door = pocketDoorAtZ2000('opening:pocket-door')

    // SHUT, the leaf lies in the world plane z = -2000, its rectangle centered at
    // world {x:1000, y:1016, z:-2000}, face normal {0,0,1}, spanning x in [550, 1450].
    // Sliding open travels one leaf-width (900mm) along the wall (+along, +world x).
    // At openness 1 the leaf still lies in the world plane z = -2000, centered at
    // world {x:1900, y:1016, z:-2000}, face normal {0,0,1}, spanning x in [1450, 2350].
    const eye: Vector3 = { x: 1900, y: 1700, z: -1000 }
    const dir: Vector3 = { x: 0, y: 0, z: -1 }
    // This ray crosses z = -2000 at distance 1000mm (within the 1500mm reach) at
    // x = 1900: inside the slid leaf's [1450, 2350] span, but 900mm past the shut
    // leaf's [550, 1450] span, so the shut leaf is missed.

    expect(openingUnderReach(eye, dir, [door], { reachMm: REACH_MM })).toBeNull()

    expect(
      openingUnderReach(eye, dir, [door], {
        openness: new Map([['opening:pocket-door', 1]]),
        reachMm: REACH_MM,
      }),
    ).toBe('opening:pocket-door')
  })
})
