import * as THREE from 'three'

import {
  FURNITURE_NODE_PREFIX,
  ROOM_RING_TOLERANCE_MM,
  type ExteriorWall,
  type JunctionFadeGroup,
} from '../../core'

import { markFadedForPicking } from './faded-for-picking'
import { wallSpanOf } from './wall-span'

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

/** The factor that takes the sum of a span's two ends to its middle. */
const SPAN_MIDDLE_FACTOR = 0.5

/** The appearance a faded material is restored to: what it looked like before any fade. */
interface FadeBaseline {
  transparent: boolean
  opacity: number
  depthWrite: boolean
}

/** A material paired with the appearance it had before any fade, so the fade can be reversed. */
interface FadeMaterial {
  material: THREE.Material
  baseline: FadeBaseline
  /** True => `updateNearWallTransparency` holds it at baseline, never dropping it to the fade opacity. */
  holdOpaque?: boolean
}

/**
 * `userData` key under which a privatized clone carries its own uuid and the baseline it
 * was cloned at, so a later enrollment can recognize its own work. The uuid is part of the
 * stamp because `Material.clone` deep-copies `userData`: a clone of a stamped material
 * carries a stamp naming a different uuid, which reads as unstamped, exactly right since
 * that copy has never been privatized.
 */
const FADE_STAMP = 'nearWallFade'

interface FadeStamp {
  uuid: string
  baseline: FadeBaseline
}

/** The baseline an earlier enrollment stamped on this very material, or none if it privatized nothing. */
function stampedBaseline(material: THREE.Material): FadeBaseline | undefined {
  const stamp = material.userData[FADE_STAMP] as FadeStamp | undefined
  return stamp !== undefined && stamp.uuid === material.uuid ? stamp.baseline : undefined
}

/**
 * The private fade clone of `material` with the appearance to restore it to. A material an
 * earlier enrollment already privatized is handed back untouched, carrying the baseline
 * stamped on it then: re-enrolling a sub-group reused across reconciles must neither clone
 * a second time nor read the material's current, possibly mid-fade, appearance as the
 * appearance to restore (issue #437).
 */
function privatizeMaterial(material: THREE.Material): FadeMaterial {
  const stamped = stampedBaseline(material)
  if (stamped !== undefined) {
    return { material, baseline: stamped }
  }
  const clone = material.clone()
  const baseline: FadeBaseline = {
    transparent: material.transparent,
    opacity: material.opacity,
    depthWrite: material.depthWrite,
  }
  clone.userData[FADE_STAMP] = { uuid: clone.uuid, baseline } satisfies FadeStamp
  return { material: clone, baseline }
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

/** Replaces a mesh's materials with private ones (single stays single) and returns them. */
function privatizeMeshMaterials(mesh: THREE.Mesh): FadeMaterial[] {
  const privatized = meshMaterials(mesh).map(privatizeMaterial)
  const materials = privatized.map((record) => record.material)
  mesh.material = Array.isArray(mesh.material) ? materials : (materials[0] as THREE.Material)
  return privatized
}

/** Privatizes the materials of every mesh under the object carrying `entityId`, or none if absent. */
function privatizeEntityMaterials(root: THREE.Object3D, entityId: string): FadeMaterial[] {
  const anchor = findNodeBy(root, (node) => node.userData.entityId === entityId)
  if (anchor === null) {
    return []
  }
  const privatized: FadeMaterial[] = []
  anchor.traverse((descendant) => {
    if (descendant instanceof THREE.Mesh) {
      privatized.push(...privatizeMeshMaterials(descendant))
    }
  })
  return privatized
}

/**
 * Enrolls one privatized fade target for a junction fill mesh. A private material is
 * required because the fill's side faces share the `junction` role material; pinning the
 * shared instance would pin every junction's material. A fill whose junction has a non-fading
 * incident wall holds opaque unconditionally (the ADR-0103 tee, `holdOpaque` on every
 * record). A pure-exterior fill instead carries the facing of each incident wall, so
 * the per-frame update fades it only when the camera is outside all of them (ADR-0140).
 */
function enrollFillMesh(
  mesh: THREE.Mesh,
  group: JunctionFadeGroup,
  facingByRunIndex: Map<number, WallFacing>,
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
    // One facing per incident exterior run actually built into `root`. An empty array
    // (every incident run absent from the built scene) leaves the update with no facing
    // to test, and `hasConditionalFade` reports false, so the fill never fades: the safe
    // hold when none of the runs it stood in for are present.
    incidentFacings: group.exteriorRunIndexes
      .map((runIndex) => facingByRunIndex.get(runIndex))
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
  facingByRunIndex: Map<number, WallFacing>,
): NearWallTarget[] {
  return fadeGroups.flatMap((group) => {
    if (group.exteriorWallIds.length === 0) {
      return []
    }
    const junctionKey = group.edgeIndexes.join(':')
    return findMeshesBy(root, (node) => node.userData.junctionKey === junctionKey).map((mesh) =>
      enrollFillMesh(mesh, group, facingByRunIndex),
    )
  })
}

/**
 * True when `mesh` belongs to `run`: its recorded span has its middle within the run's
 * extent, widened by the room-ring tolerance. A mesh with no recorded span belongs to
 * every run of its wall, so a scene built without spans fades each wall as a whole.
 */
function meshBelongsToRun(mesh: THREE.Object3D, run: ExteriorWall): boolean {
  const span = wallSpanOf(mesh)
  if (span === undefined) {
    return true
  }
  const middleMm = (span.fromMm + span.toMm) * SPAN_MIDDLE_FACTOR
  return (
    middleMm >= run.fromMm - ROOM_RING_TOLERANCE_MM && middleMm <= run.toMm + ROOM_RING_TOLERANCE_MM
  )
}

/** Every wall mesh in `root` that carries the run's wall id and belongs to the run. */
function runMeshes(root: THREE.Object3D, run: ExteriorWall): THREE.Mesh[] {
  return findMeshesBy(
    root,
    (node) => node.userData.entityId === run.wallId && meshBelongsToRun(node, run),
  )
}

/**
 * The world point and outward normal that decide the fade of `wall`, one exterior run,
 * or null if no mesh in `root` belongs to the run. The segments are collinear, so the
 * point is the center of a box expanded over every mesh of the run, keeping it on the
 * wall's plane. The outward normal is a plan-space direction; it maps to world the same
 * way `planToWorld` maps points, so plan y becomes world -z, and negating keeps it
 * aligned with the (z-flipped) wall geometry.
 */
function wallFacing(root: THREE.Object3D, wall: ExteriorWall): WallFacing | null {
  const meshes = runMeshes(root, wall)
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

/**
 * Maps each exterior run's position in `exterior` to its fade facing, skipping runs
 * with no mesh in `root`.
 */
function wallFacingMap(root: THREE.Object3D, exterior: ExteriorWall[]): Map<number, WallFacing> {
  const facingByRunIndex = new Map<number, WallFacing>()
  exterior.forEach((run, runIndex) => {
    const facing = wallFacing(root, run)
    if (facing !== null) {
      facingByRunIndex.set(runIndex, facing)
    }
  })
  return facingByRunIndex
}

/**
 * The entity id a built furniture group carries: the raw instance id, with the
 * `furniture:` node prefix stripped (the furniture-builder convention, unlike walls
 * and openings whose groups carry the full node id). Furniture node ids always
 * carry the prefix, so the slice is unconditional, matching the builders.
 */
function furnitureEntityId(nodeId: string): string {
  return nodeId.slice(FURNITURE_NODE_PREFIX.length)
}

/**
 * Builds the one fade target of an exterior run: every mesh of the run (see
 * {@link runMeshes}) plus the hosted openings and the furniture standing against it.
 * A split wall yields several sibling meshes sharing its entity id; each mesh of the
 * run is privatized so they all fade together. The facing comes from the map
 * `prepareNearWallTransparency` already built, so the run's geometry is traversed
 * once for it, not again here.
 */
function buildWallTarget(
  root: THREE.Object3D,
  wall: ExteriorWall,
  facing: WallFacing,
): NearWallTarget {
  const materials = runMeshes(root, wall).flatMap((mesh) => privatizeMeshMaterials(mesh))
  materials.push(
    ...wall.openingIds.flatMap((openingId) => privatizeEntityMaterials(root, openingId)),
  )
  materials.push(
    ...(wall.furnitureIds ?? []).flatMap((furnitureId) =>
      privatizeEntityMaterials(root, furnitureEntityId(furnitureId)),
    ),
  )
  return { materials, point: facing.point, outwardNormal: facing.outwardNormal }
}

/**
 * Yields one fade target for each entry of `exterior`, that is, for each exterior run.
 * A run's target covers the meshes whose `userData.entityId` equals the run's `wallId`
 * and whose recorded span has its middle within [fromMm - ROOM_RING_TOLERANCE_MM,
 * toMm + ROOM_RING_TOLERANCE_MM]; a wall mesh with no recorded span belongs to every
 * run of its wall. It clones the materials of those meshes, plus those of the run's
 * hosted openings and of the furniture standing against it (`furnitureIds`, filled in
 * by the core pairing; each piece belongs to at most one run, so a corner piece never
 * enrolls twice), into private instances so the run and its dependents fade together
 * while their opacity animates independently of the rest of the scene. The run's facing
 * point is the center of the bounds of its meshes; with the outward normal it decides
 * whether the camera sees the run from outside. Runs with no mesh in `root` are
 * skipped. Each junction fade group with an incident exterior run also enrolls its
 * tagged fill mesh, privatized so holding or fading one fill never pins another, by one
 * of two paths (see {@link enrollFillMesh}): an unconditional-hold group enrolls a
 * hold-opaque fill member that stays solid, covering the leg-end miter and dividing the
 * rooms, while its incident runs fade (ADR-0103); a pure-exterior group enrolls a
 * conditional fill member carrying the facings of the runs its `exteriorRunIndexes`
 * name, which fades only once the camera is outside every one of them (ADR-0140).
 */
export function prepareNearWallTransparency(
  root: THREE.Object3D,
  exterior: ExteriorWall[],
  fadeGroups: JunctionFadeGroup[] = [],
): NearWallTarget[] {
  const facingByRunIndex = wallFacingMap(root, exterior)
  const wallTargets = exterior.flatMap((run, runIndex) => {
    const facing = facingByRunIndex.get(runIndex)
    return facing === undefined ? [] : [buildWallTarget(root, run, facing)]
  })
  return [...wallTargets, ...enrollJunctionFills(root, fadeGroups, facingByRunIndex)]
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
 * The one place a fade material's opacity state is written: the faded values together
 * with the picking flag when `fade` is true, the captured baseline with the flag cleared
 * otherwise.
 */
function applyFadeState({ material, baseline }: FadeMaterial, fade: boolean): void {
  material.transparent = fade ? true : baseline.transparent
  material.opacity = fade ? FADED_OPACITY : baseline.opacity
  material.depthWrite = fade ? false : baseline.depthWrite
  markFadedForPicking(material, fade)
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
    for (const record of target.materials) {
      applyFadeState(record, faded && record.holdOpaque !== true)
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
    for (const record of target.materials) {
      applyFadeState(record, false)
    }
  }
}

/**
 * Restores the targets a shrinking enrollment set left behind. Enrollment keys on the
 * exterior wall set, so an edit that changes room topology can reclassify a wall from
 * exterior to interior while it is mid-fade. The wall then drops out of the set with its
 * materials still at the fade opacity, and no later frame reaches them, since every update
 * and restore runs over the current set. Sweeping what left the set before tracking is
 * dropped puts those materials back on their baseline (issue #526).
 */
export function restoreUnenrolledNearWallTargets(
  previous: NearWallTarget[],
  current: NearWallTarget[],
): void {
  if (previous === current) {
    return
  }
  // A rebuild hands back fresh target objects over reused materials, so what survived
  // enrollment is read off the material instances rather than off target identity.
  const stillEnrolled = new Set(
    current.flatMap((target) => target.materials.map((record) => record.material)),
  )
  restoreNearWallTransparency(
    previous.map((target) => ({
      ...target,
      materials: target.materials.filter((record) => !stillEnrolled.has(record.material)),
    })),
  )
}
