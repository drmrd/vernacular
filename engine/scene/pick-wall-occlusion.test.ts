import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import type { OpeningSceneNode, Point, RoomSceneNode, SceneGraph, WallSceneNode } from '../../core'

import { buildScene } from './build-scene'
import { pickScene } from './pick-scene'
import { worldAt } from './wall-winding-test-support'

// A wall is opaque: a ray that strikes a wall triangle that is no paintable long face
// (a cap, an end, a reveal) selects the wall and picks no surface, and does not go on to a
// floor slab or a second wall behind it. A mesh that is no wall and carries no entity or
// surface also stops the ray: the nearest object that is not faded decides.

const FLOOR_ID = 'g'
const WALL_ID = 'w1'
const WALL_ENTITY_ID = `wall:${WALL_ID}`
const SECOND_WALL_ID = 'w2'
const WALL_THICKNESS = 120
const WALL_HEIGHT = 2600
// A 3-4-5 run and rise: a wall 4000 mm long that runs along neither world axis.
const WALL_START: Point = { x: 0, y: 0 }
const WALL_END: Point = { x: 2400, y: 3200 }
const WALL_LENGTH = 4000
const WINDOW = { width: 900, height: 1200, sill: 900 }
const HALF = 0.5
/** mm: a floor slab wide enough to lie under and around both walls. */
const SLAB_REACH = 8000
/** mm along the first wall's line at which the second wall crosses it. */
const SECOND_WALL_ALONG = 5000
const SECOND_WALL_HALF_SPAN = 1500
const AIM_HEIGHT = 1300
const RAY_STANDOFF = 2000
const RAY_START_HEIGHT = 5000
/** mm: where the sloped ray starts above the floor, and where a face ray lands along. */
const REVEAL_START_HEIGHT = 2200
const LONG_FACE_ALONG = 3500
/** The angled long-face ray starts this far back along the wall and runs 3 along per 1 across. */
const LONG_FACE_START_ALONG = -2500

const ALONG: Point = { x: WALL_END.x / WALL_LENGTH, y: WALL_END.y / WALL_LENGTH }
const LEFT_NORMAL: Point = { x: -ALONG.y, y: ALONG.x }
const JAMB_ALONG = WALL_LENGTH * HALF + WINDOW.width * HALF

type BuildPath = 'plain prism' | 'opening'

/** A plan point at a distance along the first wall and an offset off its centre line. */
const planAt = (distance: number, offset: number): Point => ({
  x: WALL_START.x + ALONG.x * distance + LEFT_NORMAL.x * offset,
  y: WALL_START.y + ALONG.y * distance + LEFT_NORMAL.y * offset,
})

const wallBetween = (id: string, start: Point, end: Point): WallSceneNode => ({
  id: `wall:${id}`,
  kind: 'wall',
  floorId: FLOOR_ID,
  start,
  end,
  thickness: WALL_THICKNESS,
  height: WALL_HEIGHT,
})

const firstWall = wallBetween(WALL_ID, WALL_START, WALL_END)
// Crosses the line of the first wall, beyond its far end.
const secondWall = wallBetween(
  SECOND_WALL_ID,
  planAt(SECOND_WALL_ALONG, -SECOND_WALL_HALF_SPAN),
  planAt(SECOND_WALL_ALONG, SECOND_WALL_HALF_SPAN),
)

const centeredOpening: OpeningSceneNode = {
  id: 'opening:window',
  kind: 'opening',
  floorId: FLOOR_ID,
  type: 'cased-opening',
  hostWallId: WALL_ID,
  center: planAt(WALL_LENGTH * HALF, 0),
  along: ALONG,
  normal: LEFT_NORMAL,
  width: WINDOW.width,
  height: WINDOW.height,
  sillHeight: WINDOW.sill,
  hostThickness: WALL_THICKNESS,
  orientation: { hinge: 'start', facing: 'positive' },
}

const SLAB: Point[] = [
  { x: -SLAB_REACH, y: -SLAB_REACH },
  { x: SLAB_REACH, y: -SLAB_REACH },
  { x: SLAB_REACH, y: SLAB_REACH },
  { x: -SLAB_REACH, y: SLAB_REACH },
]

const room: RoomSceneNode = {
  id: 'room:r1',
  kind: 'room',
  floorId: FLOOR_ID,
  polygon: SLAB,
  clearPolygon: SLAB,
  area: 4 * SLAB_REACH * SLAB_REACH,
}

/** A hit on a triangle of the first wall that is no long face: the wall is selected, nothing is painted. */
const ON_WALL_ONLY = { entityId: WALL_ENTITY_ID, surface: null }

/** A floor slab under two walls, the first with or without a window in it. */
const sceneOf = (path: BuildPath): THREE.Group => {
  const graph: SceneGraph = {
    nodes: [{ id: `floor:${FLOOR_ID}`, kind: 'floor', name: 'Ground', elevation: 0 }],
    walls: [firstWall, secondWall],
    rooms: [room],
    underlays: [],
    openings: path === 'opening' ? [centeredOpening] : [],
    dimensions: [],
    stairs: [],
    furniture: [],
  }
  return buildScene(graph)
}

interface Aim {
  readonly from: THREE.Vector3
  readonly to: THREE.Vector3
}

const pickAlong = ({ from, to }: Aim, root: THREE.Group) => {
  root.updateMatrixWorld(true)
  const raycaster = new THREE.Raycaster(from, to.clone().sub(from).normalize())
  return pickScene(raycaster, root)
}

const PATHS = ['plain prism', 'opening'] as const

describe('pickScene behind a wall triangle that is no long face', () => {
  it.each(PATHS)(
    'picks no surface from a ray onto the top cap, not the floor ($path path)',
    (path) => {
      const above = worldAt(planAt(1000, 0), RAY_START_HEIGHT)
      const onTop = worldAt(planAt(1000, 0), WALL_HEIGHT)
      expect(pickAlong({ from: above, to: onTop }, sceneOf(path))).toEqual(ON_WALL_ONLY)
    },
  )

  it('picks no surface from a ray into the reveal of an opening, not the floor behind', () => {
    // Down through the void of a cased opening (it has no sash or leaf, which would take the
    // hit), onto the jamb, and on toward the floor behind it.
    const through = worldAt(planAt(WALL_LENGTH * HALF, RAY_STANDOFF), REVEAL_START_HEIGHT)
    const onJamb = worldAt(planAt(JAMB_ALONG, 0), AIM_HEIGHT)
    expect(pickAlong({ from: through, to: onJamb }, sceneOf('opening'))).toEqual(ON_WALL_ONLY)
  })

  it.each(PATHS)(
    'picks no surface from a ray onto the end cap, not the second wall ($path path)',
    (path) => {
      const beyondStart = worldAt(planAt(-RAY_STANDOFF, 0), AIM_HEIGHT)
      const atStart = worldAt(planAt(0, 0), AIM_HEIGHT)
      expect(pickAlong({ from: beyondStart, to: atStart }, sceneOf(path))).toEqual(ON_WALL_ONLY)
    },
  )
})

describe('pickScene on a long face with a floor and a second wall present', () => {
  it.each(PATHS)(
    'still picks the long face struck, not what lies behind it ($path path)',
    (path) => {
      // Aimed to cross the first wall and go on toward the second wall.
      const from = worldAt(planAt(LONG_FACE_START_ALONG, RAY_STANDOFF), AIM_HEIGHT)
      const onFace = worldAt(planAt(LONG_FACE_ALONG, 0), AIM_HEIGHT)
      expect(pickAlong({ from, to: onFace }, sceneOf(path))).toEqual({
        entityId: WALL_ENTITY_ID,
        surface: { kind: 'wall-face', wallId: WALL_ID, side: 'left' },
      })
    },
  )
})

describe('pickScene at a mesh that is no wall and carries no surface', () => {
  it('stops at the mesh and picks neither the entity nor the floor behind it', () => {
    const root = sceneOf('plain prism')
    const spot: Point = { x: -SLAB_REACH * HALF, y: -SLAB_REACH * HALF }
    const furniture = new THREE.Mesh(
      new THREE.BoxGeometry(500, 500, 500),
      new THREE.MeshBasicMaterial(),
    )
    furniture.position.copy(worldAt(spot, AIM_HEIGHT))
    root.add(furniture)
    const above = worldAt(spot, RAY_START_HEIGHT)
    expect(pickAlong({ from: above, to: worldAt(spot, 0) }, root)).toEqual({
      entityId: null,
      surface: null,
    })
  })
})
