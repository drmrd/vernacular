import { createFloor } from '../../model/factories'
import type { Floor, PeriodId, Project, ProjectMeta, StyleTag, UnitSystem } from '../../model/types'
import type { Command, CommandHandler } from '../command'
import type { CommandRegistry } from '../command-registry'

export const RENAME_PROJECT = 'project/rename'
export const SET_UNITS = 'project/set-units'
export const ADD_FLOOR = 'project/add-floor'
export const REMOVE_FLOOR = 'project/remove-floor'
export const RENAME_FLOOR = 'project/rename-floor'
export const SET_FLOOR_CEILING_HEIGHT = 'project/set-floor-ceiling-height'
export const SET_FLOOR_ELEVATION = 'project/set-floor-elevation'
export const SET_FLOOR_PERIOD = 'project/set-floor-period'
export const SET_FLOOR_STYLE = 'project/set-floor-style'
export const SET_PROJECT_PERIOD = 'project/set-period'
export const SET_PROJECT_STYLE = 'project/set-style'

export interface RenameProjectParams {
  name: string
}

export function renameProject(name: string): Command<RenameProjectParams> {
  return {
    type: RENAME_PROJECT,
    params: { name },
    description: `Rename project to "${name}"`,
  }
}

export interface SetUnitsParams {
  units: UnitSystem
}

export function setUnits(units: UnitSystem): Command<SetUnitsParams> {
  return {
    type: SET_UNITS,
    params: { units },
    description: `Switch units to ${units}`,
  }
}

export interface AddFloorParams {
  floor: Floor
}

export function addFloor(name: string): Command<AddFloorParams> {
  // Build the floor eagerly at command-creation time so the floor's id is fixed
  // once and redo reapplies the exact same floor rather than minting a new id.
  return {
    type: ADD_FLOOR,
    params: { floor: createFloor(name) },
    description: `Add floor "${name}"`,
  }
}

export interface RemoveFloorParams {
  floorId: string
}

export function removeFloor(floorId: string): Command<RemoveFloorParams> {
  return {
    type: REMOVE_FLOOR,
    params: { floorId },
    description: 'Remove floor',
  }
}

export interface RenameFloorParams {
  floorId: string
  name: string
}

export function renameFloor(floorId: string, name: string): Command<RenameFloorParams> {
  return {
    type: RENAME_FLOOR,
    params: { floorId, name },
    description: `Rename floor to "${name}"`,
    coalesceWith(previous) {
      if (previous.type !== RENAME_FLOOR) {
        return null
      }
      const previousParams = previous.params as RenameFloorParams
      if (previousParams.floorId !== floorId) {
        return null
      }
      return renameFloor(floorId, name)
    },
  }
}

export interface SetFloorCeilingHeightParams {
  floorId: string
  height: number
}

export function setFloorCeilingHeight(
  floorId: string,
  height: number,
): Command<SetFloorCeilingHeightParams> {
  return {
    type: SET_FLOOR_CEILING_HEIGHT,
    params: { floorId, height },
    description: 'Adjust ceiling height',
    coalesceWith(previous) {
      if (previous.type !== SET_FLOOR_CEILING_HEIGHT) {
        return null
      }
      const previousParams = previous.params as SetFloorCeilingHeightParams
      if (previousParams.floorId !== floorId) {
        return null
      }
      return setFloorCeilingHeight(floorId, height)
    },
  }
}

export interface SetFloorElevationParams {
  floorId: string
  elevation: number
}

export function setFloorElevation(
  floorId: string,
  elevation: number,
): Command<SetFloorElevationParams> {
  return {
    type: SET_FLOOR_ELEVATION,
    params: { floorId, elevation },
    description: 'Set floor elevation',
    coalesceWith(previous) {
      if (previous.type !== SET_FLOOR_ELEVATION) {
        return null
      }
      const previousParams = previous.params as SetFloorElevationParams
      if (previousParams.floorId !== floorId) {
        return null
      }
      return setFloorElevation(floorId, elevation)
    },
  }
}

export interface SetFloorPeriodParams {
  floorId: string
  // A floor override is clearable: `undefined` removes the override so the floor
  // falls back to the inherited project period. (Contrast setProjectPeriod, which
  // always carries a default and so has no clear path.)
  period: PeriodId | undefined
}

export function setFloorPeriod(
  floorId: string,
  period: PeriodId | undefined,
): Command<SetFloorPeriodParams> {
  return {
    type: SET_FLOOR_PERIOD,
    params: { floorId, period },
    description: 'Set floor period',
  }
}

export interface SetFloorStyleParams {
  floorId: string
  // Clearable like the floor period: `undefined` removes the override so the
  // floor inherits the project style rather than pinning its own.
  style: StyleTag | undefined
}

export function setFloorStyle(
  floorId: string,
  style: StyleTag | undefined,
): Command<SetFloorStyleParams> {
  return {
    type: SET_FLOOR_STYLE,
    params: { floorId, style },
    description: 'Set floor style',
  }
}

export interface SetProjectPeriodParams {
  // Non-clearable: a project always has a default period, so there is no
  // "inherit" state to fall back to. (Contrast setFloorPeriod, whose override
  // is clearable to undefined.)
  period: PeriodId
}

export function setProjectPeriod(period: PeriodId): Command<SetProjectPeriodParams> {
  return {
    type: SET_PROJECT_PERIOD,
    params: { period },
    description: 'Set project period',
  }
}

export interface SetProjectStyleParams {
  // Clearable: the project style is optional, so `undefined` removes it and
  // leaves the project with no default style. (Contrast setProjectPeriod, whose
  // period is always present.)
  style: StyleTag | undefined
}

export function setProjectStyle(style: StyleTag | undefined): Command<SetProjectStyleParams> {
  return {
    type: SET_PROJECT_STYLE,
    params: { style },
    description: 'Set project style',
  }
}

// Each handler reassigns a whole top-level slice of the root because the
// inverse-capture proxy records only the root's top-level properties; mutating a
// nested object in place would leave the change invisible to undo.
const renameProjectHandler: CommandHandler<Project, RenameProjectParams> = {
  apply(state, params) {
    state.meta = { ...state.meta, name: params.name }
  },
}

const setUnitsHandler: CommandHandler<Project, SetUnitsParams> = {
  apply(state, params) {
    state.meta = { ...state.meta, units: params.units }
  },
}

const addFloorHandler: CommandHandler<Project, AddFloorParams> = {
  apply(state, params) {
    state.floors = [...state.floors, params.floor]
  },
}

const removeFloorHandler: CommandHandler<Project, RemoveFloorParams> = {
  apply(state, params) {
    state.floors = state.floors.filter((floor) => floor.id !== params.floorId)
  },
}

const renameFloorHandler: CommandHandler<Project, RenameFloorParams> = {
  apply(state, params) {
    state.floors = state.floors.map((floor) =>
      floor.id === params.floorId ? { ...floor, name: params.name } : floor,
    )
  },
}

const setFloorCeilingHeightHandler: CommandHandler<Project, SetFloorCeilingHeightParams> = {
  apply(state, params) {
    state.floors = state.floors.map((floor) =>
      floor.id === params.floorId ? { ...floor, defaultCeilingHeight: params.height } : floor,
    )
  },
}

const setFloorElevationHandler: CommandHandler<Project, SetFloorElevationParams> = {
  apply(state, params) {
    state.floors = state.floors.map((floor) =>
      floor.id === params.floorId ? { ...floor, elevation: params.elevation } : floor,
    )
  },
}

interface FloorOverrides {
  periodOverride: PeriodId | undefined
  styleOverride: StyleTag | undefined
}

// Rebuilds a floor with new period and style overrides, omitting either when it
// resolves to undefined. The overrides are optional under exactOptionalPropertyTypes,
// so an absent value must be left off the object rather than written as undefined.
function rebuildFloor(floor: Floor, { periodOverride, styleOverride }: FloorOverrides): Floor {
  const next: Floor = {
    id: floor.id,
    name: floor.name,
    elevation: floor.elevation,
    defaultCeilingHeight: floor.defaultCeilingHeight,
    walls: floor.walls,
    underlays: floor.underlays,
    openings: floor.openings,
    dimensions: floor.dimensions,
  }
  if (periodOverride !== undefined) {
    next.periodOverride = periodOverride
  }
  if (styleOverride !== undefined) {
    next.styleOverride = styleOverride
  }
  return next
}

const setFloorPeriodHandler: CommandHandler<Project, SetFloorPeriodParams> = {
  apply(state, params) {
    state.floors = state.floors.map((floor) =>
      floor.id === params.floorId
        ? rebuildFloor(floor, { periodOverride: params.period, styleOverride: floor.styleOverride })
        : floor,
    )
  },
}

const setFloorStyleHandler: CommandHandler<Project, SetFloorStyleParams> = {
  apply(state, params) {
    state.floors = state.floors.map((floor) =>
      floor.id === params.floorId
        ? rebuildFloor(floor, { periodOverride: floor.periodOverride, styleOverride: params.style })
        : floor,
    )
  },
}

// Rebuilds the project meta with a new style, omitting the field when the style
// resolves to undefined. ProjectMeta.style is optional under
// exactOptionalPropertyTypes, so an absent value must be left off the object
// rather than written as undefined; a cleared style therefore drops the key.
function rebuildMetaStyle(meta: ProjectMeta, style: StyleTag | undefined): ProjectMeta {
  const next: ProjectMeta = {
    name: meta.name,
    units: meta.units,
    period: meta.period,
    schemaVersion: meta.schemaVersion,
    appVersion: meta.appVersion,
    registryVersions: meta.registryVersions,
  }
  if (style !== undefined) {
    next.style = style
  }
  return next
}

const setProjectPeriodHandler: CommandHandler<Project, SetProjectPeriodParams> = {
  apply(state, params) {
    state.meta = { ...state.meta, period: params.period }
  },
}

const setProjectStyleHandler: CommandHandler<Project, SetProjectStyleParams> = {
  apply(state, params) {
    state.meta = rebuildMetaStyle(state.meta, params.style)
  },
}

export function registerProjectCommands(
  registry: CommandRegistry<Project>,
): CommandRegistry<Project> {
  return registry
    .register(RENAME_PROJECT, renameProjectHandler)
    .register(SET_UNITS, setUnitsHandler)
    .register(ADD_FLOOR, addFloorHandler)
    .register(REMOVE_FLOOR, removeFloorHandler)
    .register(RENAME_FLOOR, renameFloorHandler)
    .register(SET_FLOOR_CEILING_HEIGHT, setFloorCeilingHeightHandler)
    .register(SET_FLOOR_ELEVATION, setFloorElevationHandler)
    .register(SET_FLOOR_PERIOD, setFloorPeriodHandler)
    .register(SET_FLOOR_STYLE, setFloorStyleHandler)
    .register(SET_PROJECT_PERIOD, setProjectPeriodHandler)
    .register(SET_PROJECT_STYLE, setProjectStyleHandler)
}
