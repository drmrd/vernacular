import type { Color } from '../../color/color'
import { surfaceKey, type PaintAssignment, type SurfaceRef } from '../../model/paint'
import type { Project } from '../../model/types'
import type { Command, CommandHandler } from '../command'
import type { CommandRegistry } from '../command-registry'

/** The finish a surface takes when none is named explicitly. */
const DEFAULT_FINISH_ID = 'matte'

export const ASSIGN_SURFACE_PAINT = 'paint/assign'

export interface AssignSurfacePaintParams {
  key: string
  assignment: PaintAssignment
}

export function assignSurfacePaint(
  ref: SurfaceRef,
  color: Color,
  finishId: string = DEFAULT_FINISH_ID,
): Command<AssignSurfacePaintParams> {
  return {
    type: ASSIGN_SURFACE_PAINT,
    params: { key: surfaceKey(ref), assignment: { color, finishId } },
    description: 'Paint surface',
  }
}

const assignSurfacePaintHandler: CommandHandler<Project, AssignSurfacePaintParams> = {
  apply(state, params) {
    // Reassign the whole paint slice so the inverse-capture proxy records the
    // root-level change and undo restores the prior reference (including back to
    // an absent map).
    state.paint = { ...state.paint, [params.key]: params.assignment }
  },
}

export const CLEAR_SURFACE_PAINT = 'paint/clear'

export interface ClearSurfacePaintParams {
  key: string
}

export function clearSurfacePaint(ref: SurfaceRef): Command<ClearSurfacePaintParams> {
  return {
    type: CLEAR_SURFACE_PAINT,
    params: { key: surfaceKey(ref) },
    description: 'Clear surface paint',
  }
}

const clearSurfacePaintHandler: CommandHandler<Project, ClearSurfacePaintParams> = {
  apply(state, params) {
    const next = { ...state.paint }
    delete next[params.key]
    // The paint field treats an absent map as "none", so collapse an emptied map
    // back to undefined rather than leaving a contract-violating empty object.
    state.paint = Object.keys(next).length > 0 ? next : undefined
  },
}

export function registerPaintCommands(
  registry: CommandRegistry<Project>,
): CommandRegistry<Project> {
  return registry
    .register(ASSIGN_SURFACE_PAINT, assignSurfacePaintHandler)
    .register(CLEAR_SURFACE_PAINT, clearSurfacePaintHandler)
}
