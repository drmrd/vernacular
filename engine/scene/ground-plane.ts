import * as THREE from 'three'

import { type Bounds3, GROUND_SURFACE_HEX } from '../../core'
import type { TextureAppearance } from '../loaders/image-texture-loader'
import { groundPlaneDepthBiasParameters } from '../materials/role-appearance'

/**
 * Engine-side default grade datum in millimeters. Used when `addGroundPlane` is
 * called without an explicit elevation (the parameter default). In normal
 * `buildScene` use the grade flows from `Site.gradeElevation` through
 * `deriveSceneGraph` to `SceneGraph.gradeElevation` and is forwarded here, so
 * this constant acts only as the fallback for plans that predate the field or
 * hand-built graphs that omit it. The zero datum treats a finished-floor
 * elevation of 0 as grade, with above-grade floors at positive elevations and
 * basements at negative ones. See ADR-0131 (original datum decision) and
 * ADR-0138 (explicit grade elevation field).
 */
export const GRADE_ELEVATION_MM = 0

/**
 * Name and userData marker identifying the ground-plane mesh, so the scene bounds,
 * picking, and selection can tell the site surface apart from building geometry.
 */
export const GROUND_PLANE_NAME = 'ground-plane'

// Lawn margin around the building footprint, in millimeters, so the ground reads as a
// site the building sits on rather than a slab cut to the walls.
const GROUND_MARGIN_MM = 5000

// Footprint side for a building with no horizontal extent (an empty plan), so a ground
// surface is always present.
const EMPTY_PLAN_GROUND_SIZE_MM = 10000

interface GroundFootprint {
  width: number
  depth: number
  centerX: number
  centerZ: number
}

/** True when an object is the ground-plane mesh rather than building geometry. */
export function isGroundPlane(object: THREE.Object3D): boolean {
  return object.userData.ground === true
}

/**
 * True when `plane` is a ground plane that was drawn with `appearance`: the same texture object
 * and a tile size equal by value, or no appearance at all for a flat plane.
 */
export function groundPlaneDrawsWith(
  plane: THREE.Object3D,
  appearance: TextureAppearance | undefined,
): boolean {
  if (!isGroundPlane(plane)) return false
  const drawn = plane.userData.appearance as TextureAppearance | undefined
  if (drawn === undefined && appearance === undefined) return true
  if (drawn === undefined || appearance === undefined) return false
  return drawn.texture === appearance.texture && sameTileSize(drawn.tileSize, appearance.tileSize)
}

function sameTileSize(a: TextureAppearance['tileSize'], b: TextureAppearance['tileSize']): boolean {
  return a.width === b.width && a.height === b.height
}

function copyOfAppearance(
  appearance: TextureAppearance | undefined,
): TextureAppearance | undefined {
  if (appearance === undefined) return undefined
  const { width, height } = appearance.tileSize
  return { texture: appearance.texture, tileSize: { width, height } }
}

function findGroundPlane(root: THREE.Object3D): THREE.Object3D | null {
  let level: THREE.Object3D[] = [root]
  while (level.length > 0) {
    const plane = level.find(isGroundPlane)
    if (plane !== undefined) return plane
    level = level.flatMap((object) => object.children)
  }
  return null
}

/**
 * The world-space box of the ground plane under `root`, in millimeters with y up, or `null`
 * when `root` holds no ground plane. The horizontal bounds come from the plane's geometry and
 * its world matrix, refreshed through every ancestor, so a parent moved after the plane was
 * built is reflected. This assumes the plane is flat by construction and its parent chain is
 * upright and unscaled, as the application builds it. Then `min.y` and `max.y` are both the
 * plane's world height, exactly equal.
 *
 * The search looks at `root`, then its children in order, then their children, level by level,
 * and stops at the first ground plane. A plane nearer `root` wins; between planes at the same
 * depth, the first in child order wins. It examines no object below the plane's level and none
 * after the plane on that level.
 */
export function groundExtent(root: THREE.Object3D): Bounds3 | null {
  const plane = findGroundPlane(root)
  if (plane === null) return null
  const grade = plane.getWorldPosition(new THREE.Vector3()).y // refreshes the ancestors' matrices
  const { min, max } = new THREE.Box3().setFromObject(plane)
  return { min: { x: min.x, y: grade, z: min.z }, max: { x: max.x, y: grade, z: max.z } }
}

// Horizontal extent of the already-built geometry, padded with the site margin so the
// lawn surrounds the building; a default square when the plan holds no geometry.
function groundFootprint(sceneRoot: THREE.Object3D): GroundFootprint {
  const box = new THREE.Box3().setFromObject(sceneRoot)
  if (box.isEmpty()) {
    return {
      width: EMPTY_PLAN_GROUND_SIZE_MM,
      depth: EMPTY_PLAN_GROUND_SIZE_MM,
      centerX: 0,
      centerZ: 0,
    }
  }
  return {
    width: box.max.x - box.min.x + GROUND_MARGIN_MM * 2,
    depth: box.max.z - box.min.z + GROUND_MARGIN_MM * 2,
    centerX: (box.min.x + box.max.x) / 2,
    centerZ: (box.min.z + box.max.z) / 2,
  }
}

// Writes each vertex's UV from its world position, so a texel keeps its world place when the
// plane grows. The mesh lies flat with local y along world -z, so v is local y minus the
// center's world z.
function writeWorldUvs(
  geometry: THREE.PlaneGeometry,
  footprint: GroundFootprint,
  tileSize: TextureAppearance['tileSize'],
): void {
  const positions = geometry.getAttribute('position')
  const uvs = geometry.getAttribute('uv')
  for (let index = 0; index < positions.count; index++) {
    uvs.setXY(
      index,
      (positions.getX(index) + footprint.centerX) / tileSize.width,
      (positions.getY(index) - footprint.centerZ) / tileSize.height,
    )
  }
}

function groundMesh(
  footprint: GroundFootprint,
  gradeElevation: number,
  appearance: TextureAppearance | undefined,
): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(footprint.width, footprint.depth)
  if (appearance !== undefined) writeWorldUvs(geometry, footprint, appearance.tileSize)
  const material = new THREE.MeshStandardMaterial({
    // Mowed-lawn green standing in for grass; the sky dome's ground bounce keeps only this
    // color's luminance. With an appearance the texture draws on white instead.
    color: appearance === undefined ? GROUND_SURFACE_HEX : 'white',
    map: appearance?.texture ?? null,
    ...groundPlaneDepthBiasParameters(),
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = GROUND_PLANE_NAME
  mesh.userData.ground = true
  mesh.userData.appearance = copyOfAppearance(appearance)
  // Lay the XY plane flat into the XZ ground plane, normal pointing up.
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(footprint.centerX, gradeElevation, footprint.centerZ)
  mesh.receiveShadow = true
  return mesh
}

/**
 * Adds a grass-colored ground plane at grade, sized to cover the building footprint
 * with a surrounding site margin. It reads the footprint from the geometry already in
 * `root`, so it must run after the floors are built. The plane carries no entity id or
 * surface ref, so it never selects or paints an entity. It is still a pickable surface:
 * `pickScene` lets the lawn take a click that lands on open ground. The plane is
 * seated at `gradeElevation`, defaulting to the grade datum when none is supplied. Given an
 * `appearance`, the plane draws its texture on white, one copy per tile, with copies fixed to
 * the world origin.
 */
export function addGroundPlane(
  root: THREE.Object3D,
  gradeElevation: number = GRADE_ELEVATION_MM,
  appearance?: TextureAppearance,
): void {
  root.add(groundMesh(groundFootprint(root), gradeElevation, appearance))
}
