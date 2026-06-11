import type { Color } from '../../color/color'
import {
  solidTreatment,
  surfaceKey,
  type SurfaceRef,
  type SurfaceTreatment,
} from '../../model/paint'
import type { Project } from '../../model/types'
import type { Command, CommandHandler } from '../command'
import type { CommandRegistry } from '../command-registry'

/** The finish a surface takes when none is named explicitly. */
const DEFAULT_FINISH_ID = 'matte'

export const ASSIGN_SURFACE_TREATMENT = 'paint/assign'

export interface AssignSurfaceTreatmentParams {
  key: string
  treatment: SurfaceTreatment
}

export function assignSurfaceTreatment(
  ref: SurfaceRef,
  treatment: SurfaceTreatment,
): Command<AssignSurfaceTreatmentParams> {
  return {
    type: ASSIGN_SURFACE_TREATMENT,
    params: { key: surfaceKey(ref), treatment },
    description: 'Paint surface',
  }
}

export function assignSurfacePaint(
  ref: SurfaceRef,
  color: Color,
  finishId: string = DEFAULT_FINISH_ID,
): Command<AssignSurfaceTreatmentParams> {
  return assignSurfaceTreatment(ref, solidTreatment(color, finishId))
}

const assignSurfaceTreatmentHandler: CommandHandler<Project, AssignSurfaceTreatmentParams> = {
  apply(state, params) {
    // Reassign the whole paint slice so the inverse-capture proxy records the
    // root-level change and undo restores the prior reference (including back to
    // an absent map).
    state.paint = { ...state.paint, [params.key]: params.treatment }
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
    .register(ASSIGN_SURFACE_TREATMENT, assignSurfaceTreatmentHandler)
    .register(CLEAR_SURFACE_PAINT, clearSurfacePaintHandler)
}
