import * as THREE from 'three'

import { FURNITURE_NODE_PREFIX, type ExteriorWall, type JunctionFadeGroup } from '../../core'

/** Opacity of a wall the camera looks at from outside, so the interior reads through it. */
const FADED_OPACITY = 0.1

/** A horizontal point and outward normal in world space (plan y maps to world Z). */
interface WorldXZ {
  x: number
  z: number
}

/** A wall's fade geometry: the world point and outward normal that decide its own fade. */
interface WallFacing {
  point: WorldXZ
  outwardNormal: WorldXZ
}

/** A material paired with the appearance it had before any fade, so the fade can be reversed. */
interface FadeMaterial {
  material: THREE.Material
  baseline: { transparent: boolean; opacity: number; depthWrite: boolean }
  /** True => `updateNearWallTransparency` holds it at baseline, never dropping it to the fade opacity. */
  holdOpaque?: boolean
}

/** Captures a freshly cloned material's transparency, opacity, and depth-write as its restore baseline. */
function fadeMaterial(material: THREE.Material): FadeMaterial {
  return {
    material,
    baseline: {
      transparent: material.transparent,
      opacity: material.opacity,
      depthWrite: material.depthWrite,
    },
  }
}

/** An exterior wall's own materials plus the world geometry that decides its fade. */
export interface NearWallTarget {
  materials: FadeMaterial[]
  point: WorldXZ
  /**
   * Meaningful only for ordinary wall targets, whose own camera-facing test reads it.
   * Both junction-fill kinds leave it zero and unused: an unconditional-hold fill masks
   * the facing test with `holdOpaque`, and a conditional fill decides its fade from
   * `incidentFacings` instead. The outward direction is undefined for a planar fill anyway.
   */
  outwardNormal: WorldXZ
  /**
   * For a conditional-hold junction fill, the facing of each incident exterior wall;
   * the fill fades only when the camera is outside every one of them. Absent for
   * ordinary walls and unconditional-hold fills.
   */
  incidentFacings?: WallFacing[]
}

/**
 * True when the camera sits on the wall's outside, i.e. the horizontal vector from
 * the wall point to the camera points along the outward normal (positive dot).
 */
export function cameraFacesWallOutside(
  camera: WorldXZ,
  point: WorldXZ,
  outwardNormal: WorldXZ,
): boolean {
  return (camera.x - point.x) * outwardNormal.x + (camera.z - point.z) * outwardNormal.z > 0
}

/** The first descendant of `root` (or `root` itself) satisfying `predicate`, else null. */
function findNodeBy(
  root: THREE.Object3D,
  predicate: (node: THREE.Object3D) => boolean,
): THREE.Object3D | null {
  let found: THREE.Object3D | null = null
  root.traverse((node) => {
    if (found === null && predicate(node)) {
      found = node
    }
  })
  return found
}

/** Every descendant mesh of `root` (or `root` itself) satisfying `predicate`. */
function findMeshesBy(
  root: THREE.Object3D,
  predicate: (node: THREE.Object3D) => boolean,
): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = []
  root.traverse((node) => {
    if (node instanceof THREE.Mesh && predicate(node)) {
      meshes.push(node)
    }
  })
  return meshes
}

/** The materials of a mesh as an array, whether it holds one material or several. */
function meshMaterials(mesh: THREE.Mesh): THREE.Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material]
}

/** Replaces a mesh's materials with private clones (single stays single) and returns them. */
function privatizeMeshMaterials(mesh: THREE.Mesh): FadeMaterial[] {
  const cloned = meshMaterials(mesh).map((material) => material.clone())
  mesh.material = Array.isArray(mesh.material) ? cloned : (cloned[0] as THREE.Material)
  return cloned.map(fadeMaterial)
}

/** Clones the materials of every mesh under the object carrying `entityId`, or none if absent. */
function cloneEntityMaterials(root: THREE.Object3D, entityId: string): FadeMaterial[] {
  const anchor = findNodeBy(root, (node) => node.userData.entityId === entityId)
  if (anchor === null) {
    return []
  }
  const cloned: FadeMaterial[] = []
  anchor.traverse((descendant) => {
    if (descendant instanceof THREE.Mesh) {
      cloned.push(...privatizeMeshMaterials(descendant))
    }
  })
  return cloned
}

/**
 * Enrolls one privatized fade target for a junction fill mesh. Cloning is required
 * because the fill's side faces share the `junction` role material; pinning the shared
 * instance would pin every junction's material. A fill whose junction has a non-fading
 * incident wall holds opaque unconditionally (the ADR-0103 tee, `holdOpaque` on every
 * record). A pure-exterior fill instead carries the facing of each incident wall, so
 * the per-frame update fades it only when the camera is outside all of them (ADR-0140).
 */
function enrollFillMesh(
  mesh: THREE.Mesh,
  group: JunctionFadeGroup,
  facingByWallId: Map<string, WallFacing>,
): NearWallTarget {
  const center = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3())
  const point = { x: center.x, z: center.z }
  if (group.fillHoldsUnconditionally) {
    return {
      materials: privatizeMeshMaterials(mesh).map((record) => ({ ...record, holdOpaque: true })),
      point,
      outwardNormal: { x: 0, z: 0 },
    }
  }
  return {
    materials: privatizeMeshMaterials(mesh),
    point,
    outwardNormal: { x: 0, z: 0 },
    // One facing per incident exterior wall actually built into `root`. An empty array
    // (every incident wall absent from the built scene) leaves the update with no facing
    // to test, and `hasConditionalFade` reports false, so the fill never fades: the safe
    // hold when none of the walls it stood in for are present.
    incidentFacings: group.exteriorWallIds
      .map((wallId) => facingByWallId.get(wallId))
      .filter((facing): facing is WallFacing => facing !== undefined),
  }
}

/**
 * Enrolls every junction fill whose `junctionKey` matches a fade group that has at
 * least one incident exterior wall, delegating each fill's opaque-hold or conditional
 * facing to {@link enrollFillMesh}.
 */
function enrollJunctionFills(
  root: THREE.Object3D,
  fadeGroups: JunctionFadeGroup[],
  facingByWallId: Map<string, WallFacing>,
): NearWallTarget[] {
  return fadeGroups.flatMap((group) => {
    if (group.exteriorWallIds.length === 0) {
      return []
    }
    const junctionKey = group.edgeIndexes.join(':')
    return findMeshesBy(root, (node) => node.userData.junctionKey === junctionKey).map((mesh) =>
      enrollFillMesh(mesh, group, facingByWallId),
    )
  })
}

/**
 * The world point and outward normal that decide `wall`'s fade, or null if no mesh in
 * `root` carries its id. The segments are collinear, so the point is the center of a
 * box expanded over every segment mesh, keeping it on the wall's plane. The outward
 * normal is a plan-space direction; it maps to world the same way `planToWorld` maps
 * points, so plan y becomes world -z, and negating keeps it aligned with the
 * (z-flipped) wall geometry.
 */
function wallFacing(root: THREE.Object3D, wall: ExteriorWall): WallFacing | null {
  const meshes = findMeshesBy(root, (node) => node.userData.entityId === wall.wallId)
  if (meshes.length === 0) {
    return null
  }
  const bounds = new THREE.Box3()
  for (const mesh of meshes) {
    bounds.expandByObject(mesh)
  }
  const center = bounds.getCenter(new THREE.Vector3())
  return {
    point: { x: center.x, z: center.z },
    outwardNormal: { x: wall.outwardNormal.x, z: -wall.outwardNormal.y },
  }
}

/** Maps each exterior wall's id to its fade facing, skipping walls absent from `root`. */
function wallFacingMap(root: THREE.Object3D, exterior: ExteriorWall[]): Map<string, WallFacing> {
  const facingByWallId = new Map<string, WallFacing>()
  for (const wall of exterior) {
    const facing = wallFacing(root, wall)
    if (facing !== null) {
      facingByWallId.set(wall.wallId, facing)
    }
  }
  return facingByWallId
}

/**
 * The entity id a built furniture group carries: the raw instance id, with the
 * `furniture:` node prefix stripped (the furniture-builder convention, unlike walls
 * and openings whose groups carry the full node id).
 */
function furnitureEntityId(nodeId: string): string {
  return nodeId.startsWith(FURNITURE_NODE_PREFIX)
    ? nodeId.slice(FURNITURE_NODE_PREFIX.length)
    : nodeId
}

/**
 * Builds one fade target covering every segment mesh of `wall` plus its hosted
 * openings and the furniture standing against it, or none if `wall` has no facing
 * (its mesh is absent from `root`). A split wall yields several sibling meshes
 * sharing its entity id; each is privatized so they all fade together. The facing is
 * read from the map `prepareNearWallTransparency` already built, so the wall's
 * geometry is traversed once, not again here.
 */
function buildWallTarget(
  root: THREE.Object3D,
  wall: ExteriorWall,
  facingByWallId: Map<string, WallFacing>,
): NearWallTarget[] {
  const facing = facingByWallId.get(wall.wallId)
  if (facing === undefined) {
    return []
  }
  const materials = findMeshesBy(root, (node) => node.userData.entityId === wall.wallId).flatMap(
    (mesh) => privatizeMeshMaterials(mesh),
  )
  materials.push(...wall.openingIds.flatMap((openingId) => cloneEntityMaterials(root, openingId)))
  materials.push(
    ...(wall.furnitureIds ?? []).flatMap((furnitureId) =>
      cloneEntityMaterials(root, furnitureEntityId(furnitureId)),
    ),
  )
  return [{ materials, point: facing.point, outwardNormal: facing.outwardNormal }]
}

/**
 * Clones each exterior wall's materials, plus those of its hosted openings and of
 * the furniture standing against it (`furnitureIds`, filled in by the core pairing;
 * each piece belongs to at most one wall, so a corner piece never enrolls twice),
 * into private instances so the wall and its dependents fade together while their
 * opacity animates independently of the rest of the scene. Records the world point
 * and outward normal that decide whether the camera sees the wall from outside. Walls
 * whose mesh is not found in `root` are skipped. Each junction fade group with an
 * incident exterior wall also enrolls its tagged fill mesh, privatized so holding or
 * fading one fill never pins another, by one of two paths (see {@link enrollFillMesh}):
 * an unconditional-hold group enrolls a hold-opaque fill member that stays solid,
 * covering the leg-end miter and dividing the rooms, while its incident walls fade
 * (ADR-0103); a pure-exterior group enrolls a conditional fill member carrying its
 * incident wall facings, which fades only once the camera is outside every one of them
 * (ADR-0140).
 */
export function prepareNearWallTransparency(
  root: THREE.Object3D,
  exterior: ExteriorWall[],
  fadeGroups: JunctionFadeGroup[] = [],
): NearWallTarget[] {
  const facingByWallId = wallFacingMap(root, exterior)
  const wallTargets = exterior.flatMap((wall) => buildWallTarget(root, wall, facingByWallId))
  return [...wallTargets, ...enrollJunctionFills(root, fadeGroups, facingByWallId)]
}

/**
 * True when `target` is a conditional junction fill (ADR-0140): it carries at least one
 * incident wall facing, so its fade is decided by whether the camera is outside every one
 * of those walls rather than by the target's own `outwardNormal`.
 */
function hasConditionalFade(
  target: NearWallTarget,
): target is NearWallTarget & { incidentFacings: WallFacing[] } {
  return target.incidentFacings !== undefined && target.incidentFacings.length > 0
}

/**
 * Fades each target's materials when the camera looks at the wall from outside,
 * and restores full opacity otherwise.
 */
export function updateNearWallTransparency(
  targets: NearWallTarget[],
  cameraPosition: WorldXZ,
): void {
  for (const target of targets) {
    const faded = hasConditionalFade(target)
      ? target.incidentFacings.every((facing) =>
          cameraFacesWallOutside(cameraPosition, facing.point, facing.outwardNormal),
        )
      : cameraFacesWallOutside(cameraPosition, target.point, target.outwardNormal)
    for (const { material, baseline, holdOpaque } of target.materials) {
      const fade = faded && holdOpaque !== true
      material.transparent = fade ? true : baseline.transparent
      material.opacity = fade ? FADED_OPACITY : baseline.opacity
      material.depthWrite = fade ? false : baseline.depthWrite
    }
  }
}

/**
 * Forces every target's materials back to their captured solid baseline, ignoring
 * camera position. Callers use this when the view leaves orbit mode, for example
 * while walking on the floor inside the building, where fading the surrounding walls
 * would be wrong: a wall faded from outside snaps back to full opacity (#256,
 * builds on ADR-0086).
 */
export function restoreNearWallTransparency(targets: NearWallTarget[]): void {
  for (const target of targets) {
    for (const { material, baseline } of target.materials) {
      material.transparent = baseline.transparent
      material.opacity = baseline.opacity
      material.depthWrite = baseline.depthWrite
    }
  }
}
