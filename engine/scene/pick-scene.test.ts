import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import type { OpeningSceneNode, Point, SceneGraph } from '../../core'

import { buildScene } from './build-scene'
import { pickScene, pickSceneAt } from './pick-scene'
import { worldAt } from './wall-winding-test-support'

// One pick gives both the entity to select and the surface to paint, from the same hit:
// the nearest object that is not faded decides both (ADR-0056, ADR-0224).

const FLOOR_ID = 'g'
const ROOM_SIDE = 4000
const WALL_THICKNESS = 200
const WALL_HEIGHT = 2400
const MIDDLE = ROOM_SIDE / 2
const OVERHEAD = 5000
const BELOW_CEILING = 1000
const DOOR = { width: 900, height: 2032 }
const DOOR_AIM_HEIGHT = 1000
const FAR_OUTSIDE = 9000

/** A spot in the room clear of the furniture, for rays to the floor and the ceiling. */
const CLEAR_SPOT: Point = { x: 3000, y: 2500 }
/** The footprint of a chair 600 mm square standing on the floor. */
const CHAIR_CORNER = 1000
const CHAIR_SPAN = 600
/** A spot on the chair's seat, off the diagonal of its triangulated top. */
const CHAIR_TOP_SPOT: Point = { x: CHAIR_CORNER + CHAIR_SPAN / 3, y: CHAIR_CORNER + CHAIR_SPAN / 2 }

const FLOOR_REF = { kind: 'floor', floorId: FLOOR_ID }
const CEILING_REF = { kind: 'ceiling', floorId: FLOOR_ID }
const NOTHING = { entityId: null, surface: null }

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

const chair: SceneGraph['furniture'][number] = {
  id: 'furniture:chair',
  kind: 'furniture',
  floorId: FLOOR_ID,
  footprintCorners: [
    { x: CHAIR_CORNER, y: CHAIR_CORNER },
    { x: CHAIR_CORNER + CHAIR_SPAN, y: CHAIR_CORNER },
    { x: CHAIR_CORNER + CHAIR_SPAN, y: CHAIR_CORNER + CHAIR_SPAN },
    { x: CHAIR_CORNER, y: CHAIR_CORNER + CHAIR_SPAN },
  ],
  elevationZ: 0,
  height: 900,
  assetRef: { scope: 'user', contentHash: 'hash-of-a-test-piece' },
}

const door: OpeningSceneNode = {
  id: 'opening:door1',
  kind: 'opening',
  floorId: FLOOR_ID,
  type: 'single-swing-door',
  center: { x: MIDDLE, y: 0 },
  along: { x: 1, y: 0 },
  normal: { x: 0, y: 1 },
  width: DOOR.width,
  height: DOOR.height,
  sillHeight: 0,
  hostThickness: WALL_THICKNESS,
  orientation: { hinge: 'start', facing: 'positive' },
  hostWallId: 'near',
}

/** A closed square room with a ceiling, its near wall along plan y = 0, plus extra parts. */
const closedRoom = (parts: Partial<SceneGraph> = {}): SceneGraph => ({
  nodes: [{ id: `floor:${FLOOR_ID}`, kind: 'floor', name: 'Ground', elevation: 0 }],
  walls: [
    wallBetween('wall:near', { x: 0, y: 0 }, { x: ROOM_SIDE, y: 0 }),
    wallBetween('wall:right', { x: ROOM_SIDE, y: 0 }, { x: ROOM_SIDE, y: ROOM_SIDE }),
    wallBetween('wall:far', { x: ROOM_SIDE, y: ROOM_SIDE }, { x: 0, y: ROOM_SIDE }),
    wallBetween('wall:left', { x: 0, y: ROOM_SIDE }, { x: 0, y: 0 }),
  ],
  rooms: [
    {
      id: 'room:r1',
      kind: 'room',
      floorId: FLOOR_ID,
      polygon: square,
      clearPolygon: square,
      area: ROOM_SIDE * ROOM_SIDE,
      ceilingHeight: WALL_HEIGHT,
    },
  ],
  underlays: [],
  openings: [],
  dimensions: [],
  stairs: [],
  furniture: [],
  ...parts,
})

const sceneOf = (graph: SceneGraph): THREE.Group => {
  const root = buildScene(graph)
  root.updateMatrixWorld(true)
  return root
}

const straightDownOnto = (plan: Point): THREE.Raycaster =>
  new THREE.Raycaster(worldAt(plan, OVERHEAD), new THREE.Vector3(0, -1, 0))

const straightUpFrom = (plan: Point): THREE.Raycaster =>
  new THREE.Raycaster(worldAt(plan, BELOW_CEILING), new THREE.Vector3(0, 1, 0))

/** A horizontal ray from outside the near wall (plan y < 0) toward +y at the plan x and height. */
const towardNearWall = (x: number, height: number): THREE.Raycaster =>
  new THREE.Raycaster(worldAt({ x, y: -ROOM_SIDE }, height), new THREE.Vector3(0, 0, -1))

describe('pickScene', () => {
  it('returns the entity id of the wall a ray strikes', () => {
    const picked = pickScene(towardNearWall(MIDDLE / 2, WALL_HEIGHT / 2), sceneOf(closedRoom()))
    expect(picked.entityId).toBe('wall:near')
  })

  it('returns a wall face as the surface when a ray strikes the face of the wall', () => {
    const picked = pickScene(towardNearWall(MIDDLE / 2, WALL_HEIGHT / 2), sceneOf(closedRoom()))
    expect(picked).toEqual({
      entityId: 'wall:near',
      surface: { kind: 'wall-face', wallId: 'near', side: 'right' },
    })
  })

  it("returns a room floor's surface ref when a ray strikes the slab top", () => {
    const picked = pickScene(straightDownOnto(CLEAR_SPOT), sceneOf(closedRoom()))
    expect(picked).toEqual({ entityId: 'room:r1', surface: FLOOR_REF })
  })

  it('returns the room and its ceiling when a ray from inside the room strikes the ceiling', () => {
    const picked = pickScene(straightUpFrom(CLEAR_SPOT), sceneOf(closedRoom()))
    expect(picked).toEqual({ entityId: 'room:r1', surface: CEILING_REF })
  })

  it('goes on through the ceiling from above to the floor below it', () => {
    const picked = pickScene(straightDownOnto(CLEAR_SPOT), sceneOf(closedRoom()))
    expect(picked.surface).toEqual(FLOOR_REF)
  })

  it('returns the furniture and no surface for a ray onto furniture, not the floor behind it', () => {
    const picked = pickScene(
      straightDownOnto(CHAIR_TOP_SPOT),
      sceneOf(closedRoom({ furniture: [chair] })),
    )
    expect(picked).toEqual({ entityId: 'chair', surface: null })
  })

  it("returns the opening's id when a ray strikes a door's leaf, not the host wall", () => {
    const picked = pickScene(
      towardNearWall(MIDDLE, DOOR_AIM_HEIGHT),
      sceneOf(closedRoom({ openings: [door] })),
    )
    expect(picked).toEqual({ entityId: 'opening:door1', surface: null })
  })

  it('returns neither an entity nor a surface for a ray onto the lawn', () => {
    const picked = pickScene(
      straightDownOnto({ x: FAR_OUTSIDE / 2, y: ROOM_SIDE / 2 }),
      sceneOf(closedRoom()),
    )
    expect(picked).toEqual(NOTHING)
  })

  it('returns null when the ray strikes nothing', () => {
    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(FAR_OUTSIDE, FAR_OUTSIDE, FAR_OUTSIDE),
      new THREE.Vector3(0, 0, -1),
    )
    expect(pickScene(raycaster, sceneOf(closedRoom()))).toEqual(NOTHING)
  })
})

describe('pickSceneAt', () => {
  const cameraAt = (from: THREE.Vector3, at: THREE.Vector3): THREE.PerspectiveCamera => {
    const camera = new THREE.PerspectiveCamera(50, 1, 1, 100000)
    camera.position.copy(from)
    camera.lookAt(at)
    camera.updateMatrixWorld(true)
    return camera
  }
  const centre = { x: 0, y: 0 }

  it('picks the wall under the centre of a camera aimed at it', () => {
    const root = sceneOf(closedRoom())
    const aimed = worldAt({ x: MIDDLE / 2, y: 0 }, WALL_HEIGHT / 2)
    const camera = cameraAt(worldAt({ x: MIDDLE / 2, y: -ROOM_SIDE }, WALL_HEIGHT / 2), aimed)
    const picked = pickSceneAt({ raycaster: new THREE.Raycaster(), camera, root, ndc: centre })
    expect(picked).toEqual({
      entityId: 'wall:near',
      surface: { kind: 'wall-face', wallId: 'near', side: 'right' },
    })
  })

  // The ground plane lies level with a ground-floor slab, so a ray that is a hair off
  // vertical meets both at the same distance: the floor, not the lawn, takes the click.
  it('picks the floor under a camera aimed straight down at it', () => {
    const root = sceneOf(closedRoom())
    const camera = cameraAt(worldAt(CLEAR_SPOT, OVERHEAD), worldAt(CLEAR_SPOT, 0))
    const picked = pickSceneAt({ raycaster: new THREE.Raycaster(), camera, root, ndc: centre })
    expect(picked).toEqual({ entityId: 'room:r1', surface: FLOOR_REF })
  })

  it('gives the same result as pickScene for the ray the camera and the point make', () => {
    const root = sceneOf(closedRoom({ furniture: [chair] }))
    const camera = cameraAt(worldAt(CHAIR_TOP_SPOT, OVERHEAD), worldAt(CHAIR_TOP_SPOT, 0))
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(new THREE.Vector2(centre.x, centre.y), camera)
    const viaPoint = pickSceneAt({ raycaster: new THREE.Raycaster(), camera, root, ndc: centre })
    expect(viaPoint).toEqual(pickScene(raycaster, root))
    expect(viaPoint.entityId).toBe('chair')
  })
})
