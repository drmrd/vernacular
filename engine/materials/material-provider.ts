import type * as THREE from 'three'

/** A nameable surface of the wall shell that later painting can key on by role. */
export type SurfaceRole = 'interiorFace' | 'exteriorFace' | 'reveal' | 'top' | 'base'

/**
 * The shell role for each of a BoxGeometry's six material groups, in its fixed
 * face order: index 0 = +X, 1 = -X, 2 = +Y, 3 = -Y, 4 = +Z, 5 = -Z. After the
 * wall builder's world-Y rotation, +Y is the upward face, -Y the downward face,
 * +Z and -Z are the two long faces along the wall, and +X / -X are the end caps.
 * A single wall has no room context to distinguish its two long faces, so the
 * interior/exterior split is a consistent convention; every role renders the
 * same in this slice.
 */
export const FACE_ROLES: SurfaceRole[] = [
  'exteriorFace', // +X end cap
  'exteriorFace', // -X end cap
  'top', // +Y upward face
  'base', // -Y downward face
  'interiorFace', // +Z long face
  'exteriorFace', // -Z long face
]

/**
 * Supplies the material for each surface role. The MVP provider returns a single
 * neutral appearance per role; a future painting provider swaps in here without
 * changing the geometry builders.
 */
export interface MaterialProvider {
  material(role: SurfaceRole): THREE.Material
}
