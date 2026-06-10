import { createFloor } from '../../model/factories'
import type { Floor, PeriodId, Project, StyleTag, UnitSystem } from '../../model/types'
import type { Command, CommandHandler } from '../command'
import type { CommandRegistry } from '../command-registry'

export const RENAME_PROJECT = 'project/rename'
export const SET_UNITS = 'project/set-units'
export const ADD_FLOOR = 'project/add-floor'
export const REMOVE_FLOOR = 'project/remove-floor'
export const SET_FLOOR_CEILING_HEIGHT = 'project/set-floor-ceiling-height'
export const SET_FLOOR_PERIOD = 'project/set-floor-period'
export const SET_FLOOR_STYLE = 'project/set-floor-style'
export const SET_PROJECT_PERIOD = 'project/set-period'

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

export interface SetFloorPeriodParams {
  floorId: string
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
  period: PeriodId
}

export function setProjectPeriod(period: PeriodId): Command<SetProjectPeriodParams> {
  return {
    type: SET_PROJECT_PERIOD,
    params: { period },
    description: 'Set project period',
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

const setFloorCeilingHeightHandler: CommandHandler<Project, SetFloorCeilingHeightParams> = {
  apply(state, params) {
    state.floors = state.floors.map((floor) =>
      floor.id === params.floorId ? { ...floor, defaultCeilingHeight: params.height } : floor,
    )
  },
}

// Rebuilds a floor with new period and style overrides, omitting either when it
// resolves to undefined. The overrides are optional under exactOptionalPropertyTypes,
// so an absent value must be left off the object rather than written as undefined.
function rebuildFloor(
  floor: Floor,
  periodOverride: PeriodId | undefined,
  styleOverride: StyleTag | undefined,
): Floor {
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
      floor.id === params.floorId ? rebuildFloor(floor, params.period, floor.styleOverride) : floor,
    )
  },
}

const setFloorStyleHandler: CommandHandler<Project, SetFloorStyleParams> = {
  apply(state, params) {
    state.floors = state.floors.map((floor) =>
      floor.id === params.floorId ? rebuildFloor(floor, floor.periodOverride, params.style) : floor,
    )
  },
}

const setProjectPeriodHandler: CommandHandler<Project, SetProjectPeriodParams> = {
  apply(state, params) {
    state.meta = { ...state.meta, period: params.period }
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
    .register(SET_FLOOR_CEILING_HEIGHT, setFloorCeilingHeightHandler)
    .register(SET_FLOOR_PERIOD, setFloorPeriodHandler)
    .register(SET_FLOOR_STYLE, setFloorStyleHandler)
    .register(SET_PROJECT_PERIOD, setProjectPeriodHandler)
}
