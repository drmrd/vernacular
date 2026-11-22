import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import {
  buildWallGraph,
  exteriorWalls,
  junctionFadeGroups,
  withAttachedFurniture,
  type Point,
  type SceneGraph,
} from '../../core'
import { findByEntityId } from '../testing'
import { NeutralMaterialProvider } from '../materials/neutral-material-provider'

import { buildScene } from './build-scene'
import { isFadedForPicking, markFadedForPicking } from './faded-for-picking'
import {
  prepareNearWallTransparency,
  updateNearWallTransparency,
  type ConditionalFillFadeTarget,
} from './near-wall-transparency'
import { pickScene } from './pick-scene'
import { worldAt } from './wall-winding-test-support'

// A click goes through a wall that is faded and through whatever fades with it: furniture
// that stands against the wall and a junction fill that fades with its walls. A junction
// fill that is held opaque is not faded, so it takes the ray as it does with no fade. The
// wall itself and a window in it are pinned in `pick-through-faded-wall.test.ts`.

const FLOOR_ID = 'g'
const ROOM_SIDE = 4000
const WALL_THICKNESS = 200
const WALL_HEIGHT = 2400
const MIDDLE = ROOM_SIDE / 2
const EYE_HEIGHT = 1500
const OUTSIDE_STANDOFF = 3000
const FAR_FACE_PLAN_Y = ROOM_SIDE - WALL_THICKNESS / 2
const FAR_FACE_AIM_HEIGHT = 1200
const WARDROBE_SPAN = 300
const OVERHEAD = 3000
/** A junction fill is neither selected nor painted: it gives no entity id and no surface. */
const NOTHING = { entityId: null, surface: null }

const NEAR_WALL = 'wall:near'
const FAR_WALL = 'wall:far'
const FLOOR_REF = { kind: 'floor', floorId: FLOOR_ID }
const FAR_FACE = { kind: 'wall-face', wallId: 'far', side: 'left' }

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

const roomNode = (id: string, polygon: Point[]): SceneGraph['rooms'][number] => ({
  id,
  kind: 'room',
  floorId: FLOOR_ID,
  polygon,
  clearPolygon: polygon,
  area: 1,
  ceilingHeight: WALL_HEIGHT,
})

const graphOf = (parts: Partial<SceneGraph>): SceneGraph => ({
  nodes: [{ id: `floor:${FLOOR_ID}`, kind: 'floor', name: 'Ground', elevation: 0 }],
  walls: [],
  rooms: [],
  underlays: [],
  openings: [],
  dimensions: [],
  stairs: [],
  furniture: [],
  ...parts,
})

const pickBoth = (raycaster: THREE.Raycaster, root: THREE.Group) => {
  root.updateMatrixWorld(true)
  return pickScene(raycaster, root)
}

const outsideEye = worldAt({ x: MIDDLE, y: -OUTSIDE_STANDOFF }, EYE_HEIGHT)
const throughWardrobeOntoFarWall = () => {
  const aim = worldAt({ x: MIDDLE, y: FAR_FACE_PLAN_Y }, FAR_FACE_AIM_HEIGHT)
  return new THREE.Raycaster(outsideEye.clone(), aim.sub(outsideEye).normalize())
}

describe('a click through furniture that fades with its exterior wall', () => {
  // A closed room with a wardrobe flush against the inside of the near wall (plan y = 0).
  const wardrobeRoom = (furnitureFades = true) => {
    const walls = [
      wallBetween(NEAR_WALL, { x: 0, y: 0 }, { x: ROOM_SIDE, y: 0 }),
      wallBetween('wall:right', { x: ROOM_SIDE, y: 0 }, { x: ROOM_SIDE, y: ROOM_SIDE }),
      wallBetween(FAR_WALL, { x: ROOM_SIDE, y: ROOM_SIDE }, { x: 0, y: ROOM_SIDE }),
      wallBetween('wall:left', { x: 0, y: ROOM_SIDE }, { x: 0, y: 0 }),
    ]
    const furniture: SceneGraph['furniture'] = [
      {
        id: 'furniture:wardrobe',
        kind: 'furniture',
        floorId: FLOOR_ID,
        footprintCorners: [
          { x: MIDDLE - WARDROBE_SPAN, y: WALL_THICKNESS / 2 },
          { x: MIDDLE + WARDROBE_SPAN, y: WALL_THICKNESS / 2 },
          { x: MIDDLE + WARDROBE_SPAN, y: WALL_THICKNESS / 2 + 2 * WARDROBE_SPAN },
          { x: MIDDLE - WARDROBE_SPAN, y: WALL_THICKNESS / 2 + 2 * WARDROBE_SPAN },
        ],
        elevationZ: 0,
        height: 1800,
        assetRef: { scope: 'user', contentHash: 'hash-of-a-test-piece' },
      },
    ]
    const graph = graphOf({ walls, rooms: [roomNode('room:r1', square)], furniture })
    const root = buildScene(graph, new NeutralMaterialProvider())
    const targets = prepareNearWallTransparency(
      root,
      furnitureFades
        ? withAttachedFurniture(
            exteriorWalls(graph.walls, graph.rooms),
            graph.walls,
            graph.furniture,
          )
        : exteriorWalls(graph.walls, graph.rooms),
    )
    return { root, targets }
  }

  it('goes on past the faded furniture to the far wall for the selection and the paint target', () => {
    const { root, targets } = wardrobeRoom()
    updateNearWallTransparency(targets, { x: outsideEye.x, z: outsideEye.z })
    expect(pickBoth(throughWardrobeOntoFarWall(), root)).toEqual({
      surface: FAR_FACE,
      entityId: FAR_WALL,
    })
  })

  it('is taken by furniture that does not fade with the wall', () => {
    const { root, targets } = wardrobeRoom(false)
    updateNearWallTransparency(targets, { x: outsideEye.x, z: outsideEye.z })
    expect(pickBoth(throughWardrobeOntoFarWall(), root)).toEqual({
      surface: null,
      entityId: 'wardrobe',
    })
  })
})

describe('a faded material that is cloned', () => {
  it('does not read as faded on a mesh that carries the clone', () => {
    const faded = new THREE.MeshStandardMaterial()
    markFadedForPicking(faded, true)
    const original = new THREE.Mesh(new THREE.BoxGeometry(), faded)
    const copy = new THREE.Mesh(new THREE.BoxGeometry(), faded.clone())
    expect(isFadedForPicking(original)).toBe(true)
    expect(isFadedForPicking(copy)).toBe(false)
  })
})

/** A ray from straight above the plan point, down onto the junction fill under it. */
const downOnto = (plan: Point): THREE.Raycaster =>
  new THREE.Raycaster(worldAt(plan, OVERHEAD), new THREE.Vector3(0, -1, 0))

/** The camera standing outside the south side of the plan point, for the fade update. */
const southOf = (plan: Point) => {
  const eye = worldAt({ x: plan.x, y: plan.y - OUTSIDE_STANDOFF }, EYE_HEIGHT)
  return { x: eye.x, z: eye.z }
}

const fillMeshIn = (root: THREE.Group): THREE.Mesh => {
  let found: THREE.Mesh | undefined
  root.traverse((object) => {
    if (object instanceof THREE.Mesh && typeof object.userData.junctionKey === 'string') {
      found = object
    }
  })
  if (found === undefined) throw new Error('the scene has no junction fill')
  return found
}

const prepared = (graph: SceneGraph) => {
  const root = buildScene(graph, new NeutralMaterialProvider())
  const fadeGroups = junctionFadeGroups(buildWallGraph(graph.walls), graph.walls, graph.rooms)
  const targets = prepareNearWallTransparency(
    root,
    exteriorWalls(graph.walls, graph.rooms),
    fadeGroups,
  )
  return { root, targets }
}

describe('a click on a junction fill that is held opaque while its wall is faded', () => {
  // A bar wall on plan y = 0 with a leg partition teed up from its middle: two rooms north
  // of the bar. The bar is exterior and fades for a camera south of it; the leg is interior,
  // so the fill at the tee keeps a solid neighbor and is held opaque (ADR-0103).
  const BAR = 2000
  const LEG = 1000
  const TEE = { x: BAR / 2, y: 0 }
  const tJunction = () => {
    const west = [{ x: 0, y: 0 }, TEE, { x: TEE.x, y: LEG }, { x: 0, y: LEG }]
    const east = [TEE, { x: BAR, y: 0 }, { x: BAR, y: LEG }, { x: TEE.x, y: LEG }]
    return prepared(
      graphOf({
        walls: [
          wallBetween('wall:bar', { x: 0, y: 0 }, { x: BAR, y: 0 }),
          wallBetween('wall:leg', TEE, { x: TEE.x, y: LEG }),
        ],
        rooms: [roomNode('room:a', west), roomNode('room:b', east)],
      }),
    )
  }

  it('does not fade the fill while the bar is faded', () => {
    const { root, targets } = tJunction()
    updateNearWallTransparency(targets, southOf(TEE))
    expect(isFadedForPicking(findByEntityId(root, 'wall:bar') as THREE.Object3D)).toBe(true)
    expect(isFadedForPicking(fillMeshIn(root))).toBe(false)
  })

  it('takes a ray from above as it does with no fade: no surface and no entity, not the floor under it', () => {
    const { root, targets } = tJunction()
    const before = pickBoth(downOnto(TEE), root)
    updateNearWallTransparency(targets, southOf(TEE))
    const after = pickBoth(downOnto(TEE), root)
    expect(after).toEqual(before)
    expect(after).toEqual(NOTHING)
  })

  it('stops the selection at the fill instead of passing on to the leg behind it', () => {
    const { root, targets } = tJunction()
    updateNearWallTransparency(targets, southOf(TEE))
    const eye = worldAt({ x: TEE.x, y: -OUTSIDE_STANDOFF }, EYE_HEIGHT)
    const aim = worldAt(TEE, FAR_FACE_AIM_HEIGHT)
    const raycaster = new THREE.Raycaster(eye.clone(), aim.sub(eye).normalize())
    expect(pickBoth(raycaster, root)).toEqual(NOTHING)
  })
})

describe('a click through a junction fill that fades with its wall', () => {
  // Two rooms that meet at one corner: every wall there is exterior, so the fill fades
  // once its incident wall does (ADR-0140). The enrolled fill is cut down to the facing of
  // one wall, so a camera south of that wall fades it.
  const CORNER = { x: 1000, y: 0 }
  const SIDE = 1000
  const cornerFill = () => {
    const a = [{ x: 0, y: 0 }, CORNER, { x: SIDE, y: SIDE }, { x: 0, y: SIDE }]
    const b = [CORNER, { x: 2 * SIDE, y: 0 }, { x: 2 * SIDE, y: -SIDE }, { x: SIDE, y: -SIDE }]
    const { root, targets } = prepared(
      graphOf({
        walls: [
          wallBetween('wall:west', { x: 0, y: 0 }, CORNER),
          wallBetween('wall:east', CORNER, { x: 2 * SIDE, y: 0 }),
          wallBetween('wall:north', CORNER, { x: SIDE, y: SIDE }),
        ],
        rooms: [roomNode('room:a', a), roomNode('room:b', b)],
      }),
    )
    const fill = targets.find(
      (target): target is ConditionalFillFadeTarget => target.kind === 'conditional-fill',
    )
    const westFacing = fill?.incidentFacings[0]
    if (fill === undefined || westFacing === undefined) {
      throw new Error('the corner fill is not enrolled')
    }
    const onlyWestFacing: ConditionalFillFadeTarget = { ...fill, incidentFacings: [westFacing] }
    return { root, targets: [onlyWestFacing] }
  }

  it('goes on to what lies under the fill for the selection and the paint target', () => {
    const { root, targets } = cornerFill()
    expect(pickBoth(downOnto(CORNER), root)).toEqual(NOTHING)
    updateNearWallTransparency(targets, southOf(CORNER))
    expect(isFadedForPicking(fillMeshIn(root))).toBe(true)
    expect(pickBoth(downOnto(CORNER), root)).toEqual({ surface: FLOOR_REF, entityId: 'room:a' })
  })
})
