import type { OpeningSceneNode } from './scene-graph'
import type { Vector3 } from './vector3'

// A door whose wall runs along world X at world Z = -2000 (plan y maps to world -z).
// The leaf rectangle spans 900mm along the wall and 2032mm tall from the floor.
export function doorAtZ2000(id: string): OpeningSceneNode {
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
export function pocketDoorAtZ2000(id: string): OpeningSceneNode {
  return {
    ...doorAtZ2000(id),
    type: 'pocket-door',
  }
}

// A double-hung window on the same wall as `doorAtZ2000`. Its frame spans world y
// [900, 2100] in the plane z = -2000. Opening it slides a sash inside the frame; the
// frame itself stays where it is.
export function hungWindowAtZ2000(id: string): OpeningSceneNode {
  return {
    ...doorAtZ2000(id),
    type: 'double-hung-window',
    height: 1200,
    sillHeight: 900,
  }
}

// A cased opening on the same wall as `doorAtZ2000`. A cased opening has no
// door leaf: it is a trimmed hole with nothing in it to open.
export function casedOpeningAtZ2000(id: string): OpeningSceneNode {
  return {
    ...doorAtZ2000(id),
    type: 'cased-opening',
  }
}

// An opening on a wall running off the axes, so along.y and normal.y are nonzero
// and the plan-y to world -Z mapping is exercised. The leaf rectangle spans 900mm
// along the wall and 2000mm tall, centered at the plan origin (world {x:0, y:1000,
// z:0}).
export function angledOpening(id: string): OpeningSceneNode {
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

export const REACH_MM = 1500

// An eye 1000mm in front of the door (world z = -1000) at standing height, looking
// toward the door at world z = -2000 (plan y maps to world -z).
export const eyeFacingDoor: Vector3 = { x: 1000, y: 1700, z: -1000 }
export const towardDoor: Vector3 = { x: 0, y: 0, z: -1 }

// A casement window on the same wall as `doorAtZ2000`. Its frame spans world y
// [900, 2100] in the plane z = -2000. Opening it swings a sash out of the frame.
export function casementAtZ2000(id: string): OpeningSceneNode {
  return {
    ...doorAtZ2000(id),
    type: 'casement-window',
    height: 1200,
    sillHeight: 900,
  }
}

// A door on the same wall direction as `doorAtZ2000`, 400mm further along the
// head-on ray (plan y 2400, so world z = -2400).
export function doorAtZ2400(id: string): OpeningSceneNode {
  return { ...doorAtZ2000(id), center: { x: 1000, y: 2400 } }
}
