import { createFloor } from '../../model/factories'
import type { Floor, Project } from '../../model/types'
import type { Command, CommandHandler } from '../command'
import type { CommandRegistry } from '../command-registry'

export const RENAME_PROJECT = 'project/rename'
export const ADD_FLOOR = 'project/add-floor'
export const REMOVE_FLOOR = 'project/remove-floor'
export const SET_FLOOR_CEILING_HEIGHT = 'project/set-floor-ceiling-height'

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

// Each handler reassigns a whole top-level slice of the root because the
// inverse-capture proxy records only the root's top-level properties; mutating a
// nested object in place would leave the change invisible to undo.
const renameProjectHandler: CommandHandler<Project, RenameProjectParams> = {
  apply(state, params) {
    state.meta = { ...state.meta, name: params.name }
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

export function registerProjectCommands(
  registry: CommandRegistry<Project>,
): CommandRegistry<Project> {
  return registry
    .register(RENAME_PROJECT, renameProjectHandler)
    .register(ADD_FLOOR, addFloorHandler)
    .register(REMOVE_FLOOR, removeFloorHandler)
    .register(SET_FLOOR_CEILING_HEIGHT, setFloorCeilingHeightHandler)
}
