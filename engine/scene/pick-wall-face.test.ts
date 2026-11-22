import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { colorFromHex, solidTreatment, surfaceKey } from '../../core'
import type { OpeningSceneNode, Point, SceneGraph, SurfaceRef, WallSceneNode } from '../../core'
import { PhysicalMaterialProvider } from '../materials/physical-material-provider'

import { buildScene } from './build-scene'
import { pickScene } from './pick-scene'
import { worldAt } from './wall-winding-test-support'

// A ray that strikes a long face of a wall picks that face. The side names follow the
// model: 'left' is the face on the left-hand normal (-dy, dx) of the wall's
// start -> end direction in plan, and 'right' is the face on the opposite side.

const WALL_ID = 'w1'
const WALL_ENTITY_ID = `wall:${WALL_ID}`
const FLOOR_ID = 'g'
const WALL_THICKNESS = 120
const WALL_HEIGHT = 2600
// A 3-4-5 run and rise: a wall 4000 mm long that runs along neither world axis.
const WALL_START: Point = { x: 0, y: 0 }
const WALL_END: Point = { x: 2400, y: 3200 }
const WALL_LENGTH = 4000
const WINDOW = { width: 900, height: 1200, sill: 900 }
/** mm along the wall: a solid stretch, clear of the centered window's void. */
const AIM_ALONG = 1000
/** mm above the floor the rays strike the wall at. */
const AIM_HEIGHT = 1300
/** mm off the wall the rays start from. */
const RAY_STANDOFF = 2000
const RAY_START_HEIGHT = 5000
const HALF = 0.5
const WHITE_LIGHT = { r: 1, g: 1, b: 1 }

const ALONG: Point = { x: WALL_END.x / WALL_LENGTH, y: WALL_END.y / WALL_LENGTH }
const LEFT_NORMAL: Point = { x: -ALONG.y, y: ALONG.x }
/** Where the window's right-hand reveal (jamb) stands along the wall. */
const JAMB_ALONG = WALL_LENGTH * HALF + WINDOW.width * HALF

type BuildPath = 'plain prism' | 'opening'
type Side = 'left' | 'right'

const faceRef = (side: Side): SurfaceRef => ({ kind: 'wall-face', wallId: WALL_ID, side })
const NORMAL_SIGN: Record<Side, number> = { left: 1, right: -1 }

/** A plan point at a distance along the wall and an offset off its centre line. */
const planAt = (distance: number, offset: number): Point => ({
  x: WALL_START.x + ALONG.x * distance + LEFT_NORMAL.x * offset,
  y: WALL_START.y + ALONG.y * distance + LEFT_NORMAL.y * offset,
})

const wall: WallSceneNode = {
  id: `wall:${WALL_ID}`,
  kind: 'wall',
  floorId: FLOOR_ID,
  start: WALL_START,
  end: WALL_END,
  thickness: WALL_THICKNESS,
  height: WALL_HEIGHT,
}

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

// The wall alone on one floor, with only its left face painted.
const LEFT_ONLY_PAINT = {
  [surfaceKey(faceRef('left'))]: solidTreatment(colorFromHex('#7744aa'), 'matte'),
}

const sceneOf = (path: BuildPath): THREE.Group => {
  const graph: SceneGraph = {
    nodes: [{ id: `floor:${FLOOR_ID}`, kind: 'floor', name: 'Ground', elevation: 0 }],
    walls: [wall],
    rooms: [],
    underlays: [],
    openings: path === 'opening' ? [centeredOpening] : [],
    dimensions: [],
    stairs: [],
    furniture: [],
  }
  const provider = new PhysicalMaterialProvider({ lightColor: WHITE_LIGHT, paint: LEFT_ONLY_PAINT })
  const root = buildScene(graph, provider)
  root.updateMatrixWorld(true)
  return root
}

interface Aim {
  readonly from: THREE.Vector3
  readonly to: THREE.Vector3
}

const raycasterFor = ({ from, to }: Aim): THREE.Raycaster =>
  new THREE.Raycaster(from, to.clone().sub(from).normalize())

/** A horizontal ray from the named side's half-space, aimed square at solid wall. */
const squareOn = (side: Side): Aim => ({
  from: worldAt(planAt(AIM_ALONG, NORMAL_SIGN[side] * RAY_STANDOFF), AIM_HEIGHT),
  to: worldAt(planAt(AIM_ALONG, 0), AIM_HEIGHT),
})

const pickKey = (path: BuildPath, aim: Aim): string | undefined => {
  const { surface } = pickScene(raycasterFor(aim), sceneOf(path))
  return surface === null ? undefined : surfaceKey(surface)
}

const PATHS = ['plain prism', 'opening'] as const
const SIDES = ['left', 'right'] as const
const FACE_CASES = PATHS.flatMap((path) => SIDES.map((side) => ({ path, side })))

describe('pickScene on a wall', () => {
  it.each(FACE_CASES)(
    'picks the $side face when the ray hits it ($path path)',
    ({ path, side }) => {
      expect(pickScene(raycasterFor(squareOn(side)), sceneOf(path))).toEqual({
        entityId: WALL_ENTITY_ID,
        surface: faceRef(side),
      })
    },
  )

  it.each(PATHS)('picks no surface from a ray that strikes the top cap ($path path)', (path) => {
    const above = worldAt(planAt(AIM_ALONG, 0), RAY_START_HEIGHT)
    const onTop = worldAt(planAt(AIM_ALONG, 0), WALL_HEIGHT)
    expect(pickScene(raycasterFor({ from: above, to: onTop }), sceneOf(path))).toEqual({
      entityId: WALL_ENTITY_ID,
      surface: null,
    })
  })

  it.each(PATHS)('picks no surface from a ray that strikes the end cap ($path path)', (path) => {
    const beyondStart = worldAt(planAt(-RAY_STANDOFF, 0), AIM_HEIGHT)
    const atStart = worldAt(planAt(0, 0), AIM_HEIGHT)
    expect(pickScene(raycasterFor({ from: beyondStart, to: atStart }), sceneOf(path))).toEqual({
      entityId: WALL_ENTITY_ID,
      surface: null,
    })
  })

  it('picks no surface from a ray that strikes the reveal of an opening', () => {
    // Through the void of a cased opening (it has no sash or leaf, which would take the
    // hit), angled to land on the jamb standing inside the wall.
    const through = worldAt(planAt(WALL_LENGTH * HALF, RAY_STANDOFF), AIM_HEIGHT)
    const onJamb = worldAt(planAt(JAMB_ALONG, 0), AIM_HEIGHT)
    expect(pickScene(raycasterFor({ from: through, to: onJamb }), sceneOf('opening'))).toEqual({
      entityId: WALL_ENTITY_ID,
      surface: null,
    })
  })
})

describe('the wall face reference picked', () => {
  it('is the painted reference when the painted left face is hit', () => {
    const key = pickKey('plain prism', squareOn('left'))
    expect(key).toBe(surfaceKey(faceRef('left')))
    expect(Object.keys(LEFT_ONLY_PAINT)).toContain(key)
  })

  it('is not a painted reference when the unpainted right face is hit', () => {
    const key = pickKey('plain prism', squareOn('right'))
    expect(key).toBe(surfaceKey(faceRef('right')))
    expect(Object.keys(LEFT_ONLY_PAINT)).not.toContain(key)
  })
})
