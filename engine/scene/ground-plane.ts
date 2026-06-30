import * as THREE from 'three'

import { groundPlaneDepthBiasParameters } from '../materials/role-appearance'

/**
 * Grade (ground-surface) elevation in millimeters: the vertical datum the ground
 * plane sits at. The model carries no explicit grade field today. It treats a
 * finished-floor elevation of 0 as the ground datum, placing above-grade floors at
 * positive elevations and basements at negative ones (core/model/floor-placement.ts,
 * and the underground filter in the building view, ADR-0127). The ground plane sits
 * at that same datum, so a partly buried basement's foundation rises through it. See
 * ADR-0131; an explicit grade/exposure model field is a recommended follow-up.
 */
export const GRADE_ELEVATION_MM = 0

/**
 * Name and userData marker identifying the ground-plane mesh, so the scene bounds,
 * picking, and selection can tell the site surface apart from building geometry.
 */
export const GROUND_PLANE_NAME = 'ground-plane'

// Mowed-lawn green standing in for grass. Pulling a grass texture through the
// content-addressed asset pipeline is out of scope here (a follow-up), so a flat
// color carries the ground for now.
const GRASS_COLOR = 0x5f8a4f

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

function groundMesh(footprint: GroundFootprint): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(footprint.width, footprint.depth)
  const material = new THREE.MeshStandardMaterial({
    color: GRASS_COLOR,
    ...groundPlaneDepthBiasParameters(),
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = GROUND_PLANE_NAME
  mesh.userData.ground = true
  // Lay the XY plane flat into the XZ ground plane, normal pointing up.
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(footprint.centerX, GRADE_ELEVATION_MM, footprint.centerZ)
  mesh.receiveShadow = true
  return mesh
}

/**
 * Adds a grass-colored ground plane at grade, sized to cover the building footprint
 * with a surrounding site margin. It reads the footprint from the geometry already in
 * `root`, so it must run after the floors are built. The plane carries no entity id or
 * surface ref, so entity picking, surface picking, and selection ignore it.
 */
export function addGroundPlane(root: THREE.Object3D): void {
  root.add(groundMesh(groundFootprint(root)))
}
