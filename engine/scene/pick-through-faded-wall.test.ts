import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { exteriorWalls, type OpeningSceneNode, type Point, type SceneGraph } from '../../core'

import { buildScene } from './build-scene'
import {
  prepareNearWallTransparency,
  restoreNearWallTransparency,
  updateNearWallTransparency,
  type NearWallTarget,
} from './near-wall-transparency'
import { pickScene } from './pick-scene'
import { worldAt } from './wall-winding-test-support'

// A click goes through a faded wall: the wall nearest to the camera is drawn at about 10
// percent opacity so the user can see into the room, and neither the selection nor the
// paint target stops there. They land on what the user sees behind it. A wall that is not
// faded still decides.

const FLOOR_ID = 'g'
const ROOM_SIDE = 4000
const WALL_THICKNESS = 200
const WALL_HEIGHT = 2400
const MIDDLE = ROOM_SIDE / 2
const EYE_HEIGHT = 1500
/** mm: how far the camera stands outside the near wall, and how far in a moved camera is. */
const OUTSIDE_STANDOFF = 3000
const INSIDE_OFFSET = 1000
/** mm: the room-facing face of the far wall lies this far in from its centre line. */
const FAR_FACE_PLAN_Y = ROOM_SIDE - WALL_THICKNESS / 2
const FAR_FACE_AIM_HEIGHT = 1200
const FLOOR_AIM = { x: MIDDLE, y: MIDDLE }
const WINDOW = { width: 900, height: 1200, sill: 900 }

const NEAR_WALL = 'wall:near'
const FAR_WALL = 'wall:far'
const WINDOW_ID = 'opening:window'
const ROOM_ID = 'room:r1'

const square: Point[] = [
  { x: 0, y: 0 },
  { x: ROOM_SIDE, y: 0 },
  { x: ROOM_SIDE, y: ROOM_SIDE },
  { x: 0, y: ROOM_SIDE },
]

const wallBetween = (id: string, start: Point, end: Point): SceneGraph['walls'][number] => ({
  id,
  kind: 'wall',
  floorId: FLOOR_ID,
  start,
  end,
  thickness: WALL_THICKNESS,
  height: WALL_HEIGHT,
})

// The near wall runs along plan y = 0 and the far wall along plan y = ROOM_SIDE, so the
// room lies between them and the camera stands on the near wall's outer side.
const windowInNearWall: OpeningSceneNode = {
  id: WINDOW_ID,
  kind: 'opening',
  floorId: FLOOR_ID,
  type: 'double-hung-window',
  hostWallId: 'near',
  center: { x: MIDDLE, y: 0 },
  along: { x: 1, y: 0 },
  normal: { x: 0, y: 1 },
  width: WINDOW.width,
  height: WINDOW.height,
  sillHeight: WINDOW.sill,
  hostThickness: WALL_THICKNESS,
  orientation: { hinge: 'start', facing: 'positive' },
}

const closedRoom = (openings: OpeningSceneNode[]): SceneGraph => ({
  nodes: [{ id: `floor:${FLOOR_ID}`, kind: 'floor', name: 'Ground', elevation: 0 }],
  walls: [
    wallBetween(NEAR_WALL, { x: 0, y: 0 }, { x: ROOM_SIDE, y: 0 }),
    wallBetween('wall:right', { x: ROOM_SIDE, y: 0 }, { x: ROOM_SIDE, y: ROOM_SIDE }),
    wallBetween(FAR_WALL, { x: ROOM_SIDE, y: ROOM_SIDE }, { x: 0, y: ROOM_SIDE }),
    wallBetween('wall:left', { x: 0, y: ROOM_SIDE }, { x: 0, y: 0 }),
  ],
  rooms: [
    {
      id: ROOM_ID,
      kind: 'room',
      floorId: FLOOR_ID,
      polygon: square,
      clearPolygon: square,
      area: ROOM_SIDE * ROOM_SIDE,
      ceilingHeight: WALL_HEIGHT,
    },
  ],
  underlays: [],
  openings,
  dimensions: [],
  stairs: [],
  furniture: [],
})

interface Room {
  readonly root: THREE.Group
  readonly targets: NearWallTarget[]
}

/** A built room with its exterior walls enrolled for the fade, none of them faded yet. */
const roomWith = (openings: OpeningSceneNode[] = []): Room => {
  const graph = closedRoom(openings)
  const root = buildScene(graph)
  const targets = prepareNearWallTransparency(
    root,
    exteriorWalls(graph.walls, graph.rooms, graph.openings),
  )
  return { root, targets }
}

/** The camera eye outside the near wall, in the middle of its length. */
const outsideEye = worldAt({ x: MIDDLE, y: -OUTSIDE_STANDOFF }, EYE_HEIGHT)
/** A camera inside the room, on the same side of the near wall as the room. */
const insideCamera = worldAt({ x: MIDDLE, y: INSIDE_OFFSET }, EYE_HEIGHT)

/** Fades the near wall, as the view does for a camera standing outside it. */
const fadeForOutsideCamera = ({ targets }: Room): void =>
  updateNearWallTransparency(targets, { x: outsideEye.x, z: outsideEye.z })

const throughNearWallOnto = (plan: Point, height: number) => {
  const direction = worldAt(plan, height).sub(outsideEye).normalize()
  return new THREE.Raycaster(outsideEye.clone(), direction)
}

const onFarWallFace = () =>
  throughNearWallOnto({ x: MIDDLE, y: FAR_FACE_PLAN_Y }, FAR_FACE_AIM_HEIGHT)
const onFloor = () => throughNearWallOnto(FLOOR_AIM, 0)

const FAR_FACE = { kind: 'wall-face', wallId: 'far', side: 'left' }
const NEAR_OUTER_FACE = { kind: 'wall-face', wallId: 'near', side: 'right' }
const FLOOR_REF = { kind: 'floor', floorId: FLOOR_ID }

const pickBoth = (raycaster: THREE.Raycaster, { root }: Room) => {
  root.updateMatrixWorld(true)
  return pickScene(raycaster, root)
}

/** The centre of a window's glass: a ray aimed here strikes glass, not the frame. */
const glassCentre = ({ root }: Room): THREE.Vector3 => {
  let centre: THREE.Vector3 | undefined
  root.traverse((object) => {
    if (centre === undefined && object.userData.openingFillRole === 'glass') {
      centre = new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3())
    }
  })
  if (centre === undefined) throw new Error('the scene has no window glass')
  return centre
}

/** A ray from `from` through the glass centre, checked to meet glass before anything else. */
const throughGlass = (room: Room, from: THREE.Vector3): THREE.Raycaster => {
  room.root.updateMatrixWorld(true)
  const raycaster = new THREE.Raycaster(from.clone(), glassCentre(room).sub(from).normalize())
  const [nearest] = raycaster.intersectObject(room.root, true)
  expect(nearest?.object.userData.openingFillRole).toBe('glass')
  return raycaster
}

describe('a click through the faded near wall of a closed room', () => {
  it('lands on the far wall room-facing side, not the near wall', () => {
    const room = roomWith()
    fadeForOutsideCamera(room)
    expect(pickBoth(onFarWallFace(), room)).toEqual({ surface: FAR_FACE, entityId: FAR_WALL })
  })

  it('lands on the floor for the paint target and on the room for the selection', () => {
    const room = roomWith()
    fadeForOutsideCamera(room)
    expect(pickBoth(onFloor(), room)).toEqual({ surface: FLOOR_REF, entityId: ROOM_ID })
  })

  it('goes through a window in the faded wall onto the far wall as well', () => {
    const room = roomWith([windowInNearWall])
    fadeForOutsideCamera(room)
    const throughWindow = throughNearWallOnto({ x: MIDDLE, y: FAR_FACE_PLAN_Y }, EYE_HEIGHT)
    expect(pickBoth(throughWindow, room)).toEqual({ surface: FAR_FACE, entityId: FAR_WALL })
  })
})

describe('a click at a near wall that is not faded', () => {
  it('is taken by the near wall for a ray aimed at the far wall', () => {
    const room = roomWith()
    expect(pickBoth(onFarWallFace(), room)).toEqual({
      surface: NEAR_OUTER_FACE,
      entityId: NEAR_WALL,
    })
  })

  it('is taken by the near wall for a ray aimed at the floor', () => {
    const room = roomWith()
    expect(pickBoth(onFloor(), room)).toEqual({ surface: NEAR_OUTER_FACE, entityId: NEAR_WALL })
  })
})

describe('a click at window glass in a near wall', () => {
  it('is taken by the window, with no paint target, while the wall is not faded', () => {
    const room = roomWith([windowInNearWall])
    expect(pickBoth(throughGlass(room, outsideEye), room)).toEqual({
      entityId: WINDOW_ID,
      surface: null,
    })
  })

  it('goes on through the glass of the faded wall onto the far wall', () => {
    const room = roomWith([windowInNearWall])
    fadeForOutsideCamera(room)
    expect(pickBoth(throughGlass(room, outsideEye), room)).toEqual({
      entityId: FAR_WALL,
      surface: FAR_FACE,
    })
  })
})

describe('a near wall whose fade is removed again', () => {
  const removals: ReadonlyArray<readonly [string, (room: Room) => void]> = [
    [
      'the camera moves inside the room',
      ({ targets }) =>
        updateNearWallTransparency(targets, { x: insideCamera.x, z: insideCamera.z }),
    ],
    ['the fade is restored', ({ targets }) => restoreNearWallTransparency(targets)],
  ]

  it.each(removals)('takes the click again once %s', (_name, remove) => {
    const room = roomWith()
    fadeForOutsideCamera(room)
    remove(room)
    expect(pickBoth(onFarWallFace(), room)).toEqual({
      surface: NEAR_OUTER_FACE,
      entityId: NEAR_WALL,
    })
    expect(pickBoth(onFloor(), room)).toEqual({ surface: NEAR_OUTER_FACE, entityId: NEAR_WALL })
  })
})
