import * as THREE from 'three'

import type { SurfaceRef } from '../../core'
import type { MaterialProvider } from '../materials/material-provider'

import { geometryFromSections, type WallSection } from './geometry-utils'

/**
 * The `userData` key under which a wall mesh carries its surface table: the paint
 * surface ref for each material group index, or null for a group that is not a
 * paintable face (caps, ends, reveals).
 */
export const SURFACE_BY_MATERIAL_INDEX_KEY = 'surfaceByMaterialIndex'

/** The surface ref of each material group, indexed by the group's material index. */
export type SurfaceTable = (SurfaceRef | null)[]

/**
 * Builds the surface table from the same section list that assigns the mesh's
 * material groups ({@link geometryFromSections} gives section `i` material index `i`),
 * so a picked group resolves to the ref whose paint the renderer shows on it.
 */
function surfaceTableFromSections(sections: WallSection[]): SurfaceTable {
  return sections.map((section) => section.ref ?? null)
}

/**
 * Builds a wall mesh from `sections` and stamps its entity id and surface table. Section
 * `i` is geometry material group `i`, material `i`, and surface table entry `i`, so a
 * picked group resolves to the ref whose paint the renderer shows on it.
 */
export function buildSectionMesh(
  sections: WallSection[],
  materials: MaterialProvider,
  entityId: string,
): THREE.Mesh {
  const material = sections.map((section) => materials.material(section.role, section.ref))
  const mesh = new THREE.Mesh(geometryFromSections(sections), material)
  mesh.userData.entityId = entityId
  mesh.userData[SURFACE_BY_MATERIAL_INDEX_KEY] = surfaceTableFromSections(sections)
  return mesh
}

/** The surface table an object carries, or undefined when it carries none. */
export function surfaceTableOf(object: THREE.Object3D): SurfaceTable | undefined {
  const table: unknown = object.userData[SURFACE_BY_MATERIAL_INDEX_KEY]
  return Array.isArray(table) ? (table as SurfaceTable) : undefined
}
