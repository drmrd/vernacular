import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { colorFromHex, solidTreatment, surfaceKey } from '../../core'
import type { OpeningSceneNode, Point, SceneGraph, SurfaceRef, WallSceneNode } from '../../core'
import { PhysicalMaterialProvider } from '../materials/physical-material-provider'

import { buildScene } from './build-scene'
import { worldAt } from './wall-winding-test-support'

// Each long face of a wall shows the paint of its own side. The side names follow
// the model and the 2D plan: 'left' is the face on the +normal side, where the
// normal is the left-hand normal (-dy, dx) of the wall's start -> end direction in
// plan, and 'right' is the face on the -normal side.

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
/** mm off the wall face line each ray starts from. */
const RAY_STANDOFF = 2000
const HALF = 0.5
const LEFT_PAINT = '#7744aa'
const RIGHT_PAINT = '#33aa55'
const FINISH = 'matte'
const WHITE_LIGHT = { r: 1, g: 1, b: 1 }

const ALONG: Point = { x: WALL_END.x / WALL_LENGTH, y: WALL_END.y / WALL_LENGTH }
const LEFT_NORMAL: Point = { x: -ALONG.y, y: ALONG.x }

type BuildPath = 'plain prism' | 'opening'
type Side = 'left' | 'right'

const faceRef = (side: Side): SurfaceRef => ({ kind: 'wall-face', wallId: WALL_ID, side })

const PAINT = {
  [surfaceKey(faceRef('left'))]: solidTreatment(colorFromHex(LEFT_PAINT), FINISH),
  [surfaceKey(faceRef('right'))]: solidTreatment(colorFromHex(RIGHT_PAINT), FINISH),
}
const PAINT_HEX: Record<Side, string> = { left: LEFT_PAINT, right: RIGHT_PAINT }
/** The sign of the plan normal on whose side each named face stands. */
const NORMAL_SIGN: Record<Side, number> = { left: 1, right: -1 }

const along = (distance: number): Point => ({
  x: WALL_START.x + ALONG.x * distance,
  y: WALL_START.y + ALONG.y * distance,
})

const wall: WallSceneNode = {
  id: WALL_ENTITY_ID,
  kind: 'wall',
  floorId: FLOOR_ID,
  start: WALL_START,
  end: WALL_END,
  thickness: WALL_THICKNESS,
  height: WALL_HEIGHT,
}

const centeredWindow: OpeningSceneNode = {
  id: 'opening:window',
  kind: 'opening',
  floorId: FLOOR_ID,
  type: 'double-hung-window',
  hostWallId: WALL_ID,
  center: along(WALL_LENGTH * HALF),
  along: ALONG,
  normal: LEFT_NORMAL,
  width: WINDOW.width,
  height: WINDOW.height,
  sillHeight: WINDOW.sill,
  hostThickness: WALL_THICKNESS,
  orientation: { hinge: 'start', facing: 'positive' },
}

// The wall alone on one floor, painted through the scene's paint-aware provider.
const paintedScene = (path: BuildPath): THREE.Group => {
  const graph: SceneGraph = {
    nodes: [{ id: `floor:${FLOOR_ID}`, kind: 'floor', name: 'Ground', elevation: 0 }],
    walls: [wall],
    rooms: [],
    underlays: [],
    openings: path === 'opening' ? [centeredWindow] : [],
    dimensions: [],
    stairs: [],
    furniture: [],
  }
  const root = buildScene(
    graph,
    new PhysicalMaterialProvider({ lightColor: WHITE_LIGHT, paint: PAINT }),
  )
  root.updateMatrixWorld(true)
  return root
}

// A horizontal ray from the named side's half-space, aimed square at the wall.
const rayFrom = (side: Side): THREE.Raycaster => {
  const target = along(AIM_ALONG)
  const offset = NORMAL_SIGN[side] * RAY_STANDOFF
  const origin = worldAt(
    { x: target.x + LEFT_NORMAL.x * offset, y: target.y + LEFT_NORMAL.y * offset },
    AIM_HEIGHT,
  )
  const direction = worldAt(target, AIM_HEIGHT).sub(origin).normalize()
  return new THREE.Raycaster(origin, direction)
}

// The color of the wall material on the nearest wall triangle the ray strikes.
const hitWallColor = (root: THREE.Group, side: Side): THREE.Color | undefined => {
  const hit = rayFrom(side)
    .intersectObject(root, true)
    .find((candidate) => candidate.object.userData.entityId === WALL_ENTITY_ID)
  if (hit === undefined || !(hit.object instanceof THREE.Mesh)) return undefined
  const materials = hit.object.material as THREE.MeshStandardMaterial[]
  return materials[hit.face?.materialIndex ?? -1]?.color
}

const APPROACH: Record<Side, string> = { left: '+normal', right: '-normal' }

const CASES = (['plain prism', 'opening'] as const).flatMap((path) =>
  (['left', 'right'] as const).map((side) => ({ path, side, approach: APPROACH[side] })),
)

describe('wall paint side', () => {
  it.each(CASES)(
    'draws the face hit from the $approach side in the $side paint ($path path)',
    ({ path, side }) => {
      const color = hitWallColor(paintedScene(path), side)
      expect(color?.getHexString()).toBe(new THREE.Color(PAINT_HEX[side]).getHexString())
    },
  )
})
