import * as THREE from 'three'
import type { Floor, SceneGraph } from '../../core'
import { nodesOf } from '../../core/scene/wall-runs-test-fixtures'
import { NeutralMaterialProvider } from '../materials/neutral-material-provider'
import { buildScene } from './build-scene'
import { updateNearWallTransparency } from './near-wall-transparency'
import { enrollNearWallTargets } from './near-wall-transparency-enrollment'
import { WALL_SPAN_KEY, type WallSpan } from './wall-span'

/** The opacity a material sits at once the near-wall fade has faded it. */
export const FADED_OPACITY = 0.1

/** A wall mesh seen through what a fade test asserts: its recorded span and whether it is faded. */
export interface Piece {
  span: WallSpan | undefined
  faded: boolean
}

/** The scene graph of a one-floor fixture `floor`, with no underlays, dimensions, stairs or furniture. */
export const sceneGraphOf = (floor: Floor): SceneGraph => ({
  nodes: [{ id: 'floor:g', kind: 'floor', name: 'Ground', elevation: 0 }],
  ...nodesOf(floor),
  underlays: [],
  dimensions: [],
  stairs: [],
  furniture: [],
})

/** The scene of `floor` with the near-wall fade applied for a camera at `camera`. */
export function fadedScene(floor: Floor, camera: { x: number; z: number }): THREE.Group {
  const graph = sceneGraphOf(floor)
  const root = buildScene(graph, new NeutralMaterialProvider())
  updateNearWallTransparency(enrollNearWallTargets(root, graph), camera)
  return root
}

/** True when some material of a mesh at or under `object` sits at the faded opacity. */
export function isFaded(object: THREE.Object3D): boolean {
  let faded = false
  object.traverse((part) => {
    if (!(part instanceof THREE.Mesh)) return
    const materials: THREE.Material[] = Array.isArray(part.material)
      ? part.material
      : [part.material]
    faded ||= materials.some((material) => material.opacity === FADED_OPACITY)
  })
  return faded
}

/** The meshes of the wall `entityId` with their recorded span and whether each is faded, by start. */
export function piecesOf(root: THREE.Object3D, entityId: string): Piece[] {
  const pieces: Piece[] = []
  root.traverse((object) => {
    if (object instanceof THREE.Mesh && object.userData.entityId === entityId) {
      pieces.push({
        span: object.userData[WALL_SPAN_KEY] as WallSpan | undefined,
        faded: isFaded(object),
      })
    }
  })
  return pieces.sort((a, b) => (a.span?.fromMm ?? 0) - (b.span?.fromMm ?? 0))
}
