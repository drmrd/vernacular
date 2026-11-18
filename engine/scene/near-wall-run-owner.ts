/**
 * Which exterior run owns a wall mesh. Each wall mesh belongs to at most one fade target:
 * the first run, in `exterior` order, of its wall whose stretch (widened by
 * `ROOM_RING_TOLERANCE_MM`) holds the middle of the mesh's recorded span. A wall mesh with
 * no recorded span belongs to the first run of its wall. A mesh whose span middle lies in
 * no run has no owner.
 */
import type * as THREE from 'three'

import { ROOM_RING_TOLERANCE_MM, type ExteriorWall } from '../../core'

import { wallSpanOf } from './wall-span'

/** The factor that takes the sum of a span's two ends to its middle. */
const SPAN_MIDDLE_FACTOR = 0.5

/** The meshes each exterior run owns, keyed by the run's position in `exterior`. */
export type MeshesByRunIndex = Map<number, THREE.Mesh[]>

/** Appends `item` to the array under `key`, creating the array on first use. */
function pushTo<K, V>(map: Map<K, V[]>, key: K, item: V): void {
  const items = map.get(key)
  if (items === undefined) {
    map.set(key, [item])
  } else {
    items.push(item)
  }
}

/** The positions in `exterior` of each wall's runs, indexed by wall id, in `exterior` order. */
function runIndexesByWallId(exterior: ExteriorWall[]): Map<string, number[]> {
  const runIndexes = new Map<string, number[]>()
  exterior.forEach((run, runIndex) => {
    pushTo(runIndexes, run.wallId, runIndex)
  })
  return runIndexes
}

/**
 * The position in `exterior` of the run that owns `mesh`, chosen among the wall's runs
 * (`wallRunIndexes`, in `exterior` order): the first whose stretch, widened by the
 * room-ring tolerance, holds the middle of the mesh's recorded span. A mesh with no
 * recorded span belongs to the first run, so a scene built without spans fades each
 * wall as a whole. Undefined when the middle lies in no run.
 */
function ownerRunIndex(
  mesh: THREE.Object3D,
  wallRunIndexes: number[],
  exterior: ExteriorWall[],
): number | undefined {
  const span = wallSpanOf(mesh)
  if (span === undefined) {
    return wallRunIndexes[0]
  }
  const middleMm = (span.fromMm + span.toMm) * SPAN_MIDDLE_FACTOR
  return wallRunIndexes.find((runIndex) => {
    const run = exterior[runIndex] as ExteriorWall
    return (
      middleMm >= run.fromMm - ROOM_RING_TOLERANCE_MM &&
      middleMm <= run.toMm + ROOM_RING_TOLERANCE_MM
    )
  })
}

/**
 * Groups `wallMeshes` under the position in `exterior` of the run that owns each (see
 * {@link ownerRunIndex}). Each mesh lands in at most one group; a mesh of a wall with no
 * run, or whose span middle lies in none of its wall's runs, lands in none.
 */
export function ownedMeshesByRunIndex(
  wallMeshes: THREE.Mesh[],
  exterior: ExteriorWall[],
): MeshesByRunIndex {
  const runIndexes = runIndexesByWallId(exterior)
  const meshesByRunIndex: MeshesByRunIndex = new Map()
  for (const mesh of wallMeshes) {
    const wallRunIndexes = runIndexes.get(mesh.userData.entityId as string) ?? []
    const runIndex = ownerRunIndex(mesh, wallRunIndexes, exterior)
    if (runIndex !== undefined) {
      pushTo(meshesByRunIndex, runIndex, mesh)
    }
  }
  return meshesByRunIndex
}
