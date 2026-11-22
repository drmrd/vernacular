import * as THREE from 'three'

import { FURNITURE_NODE_PREFIX, type ExteriorWall, type JunctionFadeGroup } from '../../core'

import { markFadedForPicking } from './faded-for-picking'
import { ownedMeshesByRunIndex, type MeshesByRunIndex } from './near-wall-run-owner'

/** Opacity of a wall the camera looks at from outside, so the interior reads through it. */
const FADED_OPACITY = 0.1

/** A horizontal point and outward normal in world space (plan y maps to world Z). */
interface WorldXZ {
  x: number
  z: number
}

/** An exterior run's fade geometry: the world point and outward normal that decide its own fade. */
interface WallFacing {
  point: WorldXZ
  outwardNormal: WorldXZ
}

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
  /**
   * True on every material of a held fill: it stays at baseline and never drops to the fade
   * opacity. `kind: 'held-fill'` now covers this, so the flag stays only until issue #1075
   * removes it.
   */
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

/** An exterior run's own materials plus the world geometry that decides its fade by its own facing. */
export interface WallFadeTarget {
  kind: 'wall'
  materials: FadeMaterial[]
  point: WorldXZ
  outwardNormal: WorldXZ
}

/** A junction fill that stays solid (the ADR-0103 tee): it never fades, whatever the camera does. */
export interface HeldFillFadeTarget {
  kind: 'held-fill'
  materials: FadeMaterial[]
  point: WorldXZ
}

/**
 * A pure-exterior junction fill (ADR-0140): the facing of each incident exterior run, and it
 * fades only when the camera is outside every one of them. An empty list never fades.
 */
export interface ConditionalFillFadeTarget {
  kind: 'conditional-fill'
  materials: FadeMaterial[]
  point: WorldXZ
  incidentFacings: WallFacing[]
}

export type NearWallTarget = WallFadeTarget | HeldFillFadeTarget | ConditionalFillFadeTarget

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
 * incident wall holds opaque unconditionally (the ADR-0103 tee, a held-fill target whose
 * records carry `holdOpaque`). A pure-exterior fill instead carries the facing of each
 * incident run, so the per-frame update fades it only when the camera is outside all of them
 * (ADR-0140).
 */
function enrollFillMesh(
  mesh: THREE.Mesh,
  group: JunctionFadeGroup,
  facingByRunIndex: Map<number, WallFacing>,
): HeldFillFadeTarget | ConditionalFillFadeTarget {
  const center = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3())
  const point = { x: center.x, z: center.z }
  if (group.fillHoldsUnconditionally) {
    const materials = privatizeMeshMaterials(mesh).map((record) => ({
      ...record,
      holdOpaque: true,
    }))
    return { kind: 'held-fill', materials, point }
  }
  return {
    kind: 'conditional-fill',
    materials: privatizeMeshMaterials(mesh),
    point,
    // One facing per incident exterior run actually built into `root`. An empty array
    // (every incident run absent from the built scene) leaves the update with no facing
    // to test, so the fill never fades: the safe hold when none of the runs it stood in for
    // are present.
    incidentFacings: group.exteriorRunIndexes
      .map((runIndex) => facingByRunIndex.get(runIndex))
      .filter((facing): facing is WallFacing => facing !== undefined),
  }
}

/**
 * Enrolls every junction fill whose `junctionKey` matches a fade group that has at
 * least one incident exterior run, delegating each fill's opaque-hold or conditional
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
 * The world point and outward normal that decide the fade of `wall`, one exterior run,
 * or null if the run owns no mesh (`meshes`). The segments are collinear, so the
 * point is the center of a box expanded over every mesh of the run, keeping it on the
 * wall's plane. The outward normal is a plan-space direction; it maps to world the same
 * way `planToWorld` maps points, so plan y becomes world -z, and negating keeps it
 * aligned with the (z-flipped) wall geometry.
 */
function wallFacing(meshes: THREE.Mesh[], wall: ExteriorWall): WallFacing | null {
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
 * that own no mesh.
 */
function wallFacingMap(
  meshesByRunIndex: MeshesByRunIndex,
  exterior: ExteriorWall[],
): Map<number, WallFacing> {
  const facingByRunIndex = new Map<number, WallFacing>()
  exterior.forEach((run, runIndex) => {
    const facing = wallFacing(meshesByRunIndex.get(runIndex) ?? [], run)
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
 * Builds the one fade target of an exterior run: every mesh the run owns (see
 * {@link ownedMeshesByRunIndex}) plus the hosted openings and the furniture standing against it.
 * A split wall yields several sibling meshes sharing its entity id; each mesh the
 * run owns is privatized so they all fade together. The meshes and the facing come from
 * what `prepareNearWallTransparency` already worked out, so the scene is not searched
 * again here.
 */
function buildWallTarget(
  root: THREE.Object3D,
  wall: ExteriorWall,
  { meshes, facing }: { meshes: THREE.Mesh[]; facing: WallFacing },
): WallFadeTarget {
  const materials = meshes.flatMap((mesh) => privatizeMeshMaterials(mesh))
  materials.push(
    ...wall.openingIds.flatMap((openingId) => privatizeEntityMaterials(root, openingId)),
  )
  materials.push(
    ...(wall.furnitureIds ?? []).flatMap((furnitureId) =>
      privatizeEntityMaterials(root, furnitureEntityId(furnitureId)),
    ),
  )
  return { kind: 'wall', materials, point: facing.point, outwardNormal: facing.outwardNormal }
}

/**
 * Yields one fade target for each entry of `exterior`, that is, for each exterior run.
 * Each wall mesh belongs to at most one fade target: the first run, in `exterior` order,
 * of its wall whose stretch (widened by `ROOM_RING_TOLERANCE_MM`) holds the middle of the
 * mesh's recorded span. A wall mesh with no recorded span belongs to the first run of its
 * wall (see `near-wall-run-owner.ts`). A run's target clones the materials of the meshes
 * it owns, plus those of the run's hosted openings and of the furniture standing against it (`furnitureIds`, filled in
 * by the core pairing; each piece belongs to at most one run, so a corner piece never
 * enrolls twice), into private instances so the run and its dependents fade together
 * while their opacity animates independently of the rest of the scene. The run's facing
 * point is the center of the bounds of its meshes; with the outward normal it decides
 * whether the camera sees the run from outside. Runs that own no mesh are
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
  const wallIds = new Set(exterior.map((run) => run.wallId))
  const wallMeshes = findMeshesBy(root, (node) => wallIds.has(node.userData.entityId as string))
  const meshesByRunIndex = ownedMeshesByRunIndex(wallMeshes, exterior)
  const facingByRunIndex = wallFacingMap(meshesByRunIndex, exterior)
  const wallTargets = exterior.flatMap((run, runIndex) => {
    const facing = facingByRunIndex.get(runIndex)
    const meshes = meshesByRunIndex.get(runIndex) ?? []
    return facing === undefined ? [] : [buildWallTarget(root, run, { meshes, facing })]
  })
  return [...wallTargets, ...enrollJunctionFills(root, fadeGroups, facingByRunIndex)]
}

/**
 * Whether `target` fades for a camera at `cameraPosition`. A wall fades by its own facing, a
 * held fill never fades, and a conditional fill fades when the camera is outside every incident
 * facing (an empty list never fades: the safe hold when none of its runs are present).
 */
function shouldFade(target: NearWallTarget, cameraPosition: WorldXZ): boolean {
  switch (target.kind) {
    case 'wall':
      return cameraFacesWallOutside(cameraPosition, target.point, target.outwardNormal)
    case 'held-fill':
      return false
    case 'conditional-fill':
      return (
        target.incidentFacings.length > 0 &&
        target.incidentFacings.every((facing) =>
          cameraFacesWallOutside(cameraPosition, facing.point, facing.outwardNormal),
        )
      )
  }
}

/**
 * Writes the two flags that change how a material is drawn, and marks the material for a
 * rebuild only when one of them really changes. The renderer builds a program for a
 * material at its first draw and rebuilds it only when the material is marked
 * (`needsUpdate`), so a flag flipped without the mark leaves the program built under the
 * old flags (issue #781). Setting both flags still raises the version by exactly one, and
 * a call that changes neither leaves it alone, so no frame pays for a needless rebuild.
 */
function setDrawFlags(
  material: THREE.Material,
  flags: { transparent: boolean; depthWrite: boolean },
): void {
  const changed =
    material.transparent !== flags.transparent || material.depthWrite !== flags.depthWrite
  material.transparent = flags.transparent
  material.depthWrite = flags.depthWrite
  if (changed) {
    material.needsUpdate = true
  }
}

/**
 * The one place a fade material's opacity state is written: the faded values together
 * with the picking flag when `fade` is true, the captured baseline with the flag cleared
 * otherwise. The draw flags go through {@link setDrawFlags}, which marks the material for
 * a rebuild when they change; the opacity alone needs no rebuild.
 */
function applyFadeState({ material, baseline }: FadeMaterial, fade: boolean): void {
  setDrawFlags(material, {
    transparent: fade ? true : baseline.transparent,
    depthWrite: fade ? false : baseline.depthWrite,
  })
  material.opacity = fade ? FADED_OPACITY : baseline.opacity
  markFadedForPicking(material, fade)
}

/**
 * Fades each target's materials when the camera looks at the wall from outside,
 * and restores full opacity otherwise. A material whose `transparent` or `depthWrite` this
 * call changes is marked `needsUpdate`, so the renderer builds its shader again; a call that
 * changes neither leaves its version alone.
 */
export function updateNearWallTransparency(
  targets: NearWallTarget[],
  cameraPosition: WorldXZ,
): void {
  for (const target of targets) {
    const faded = shouldFade(target, cameraPosition)
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
 * builds on ADR-0086). A material whose `transparent` or `depthWrite` this call changes is
 * marked `needsUpdate`, so the renderer builds its shader again; a call that changes neither
 * leaves its version alone.
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
 * exterior run set, so an edit that changes room topology can reclassify a run from
 * exterior to interior while it is mid-fade. The run then drops out of the set with its
 * materials still at the fade opacity, and no later frame reaches them, since every update
 * and restore runs over the current set. Sweeping what left the set before tracking is
 * dropped puts those materials back on their baseline (issue #526). A material whose
 * `transparent` or `depthWrite` this call changes is marked `needsUpdate`, so the renderer
 * builds its shader again; a call that changes neither leaves its version alone.
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
