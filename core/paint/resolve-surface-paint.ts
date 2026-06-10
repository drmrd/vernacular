import { surfaceKey, type PaintAssignment, type SurfaceRef } from '../model/paint'
import type { Project } from '../model/types'

/** The paint assigned to a surface, or undefined when the surface is unpainted. */
export function resolveSurfacePaint(
  project: Project,
  ref: SurfaceRef,
): PaintAssignment | undefined {
  return project.paint?.[surfaceKey(ref)]
}
