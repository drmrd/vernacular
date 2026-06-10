import type { Point, Project, Stair } from '../../model/types'
import type { Command, CommandHandler } from '../command'
import type { CommandRegistry } from '../command-registry'

export const ADD_STAIR = 'project/add-stair'
export const REMOVE_STAIR = 'project/remove-stair'
export const MOVE_STAIR = 'project/move-stair'

export interface AddStairParams {
  stair: Stair
}

export function addStair(stair: Stair): Command<AddStairParams> {
  return {
    type: ADD_STAIR,
    params: { stair },
    description: 'Add stair',
  }
}

export interface RemoveStairParams {
  stairId: string
}

export function removeStair(stairId: string): Command<RemoveStairParams> {
  return {
    type: REMOVE_STAIR,
    params: { stairId },
    description: 'Remove stair',
  }
}

export interface MoveStairParams {
  stairId: string
  position: Point
}

export function moveStair(stairId: string, position: Point): Command<MoveStairParams> {
  return {
    type: MOVE_STAIR,
    params: { stairId, position },
    description: 'Move stair',
    // Collapses a continuous drag of one stair into a single undoable step by
    // merging only with an immediately preceding move of the same stair.
    coalesceWith(previous) {
      if (previous.type !== MOVE_STAIR) {
        return null
      }
      if ((previous.params as MoveStairParams).stairId !== stairId) {
        return null
      }
      return moveStair(stairId, position)
    },
  }
}

// Reassigns the whole `stairs` slice so the inverse-capture proxy records the
// change; mutating the array in place would leave the change invisible to undo.
const addStairHandler: CommandHandler<Project, AddStairParams> = {
  apply(state, params) {
    state.stairs = [...state.stairs, params.stair]
  },
}

const removeStairHandler: CommandHandler<Project, RemoveStairParams> = {
  apply(state, params) {
    state.stairs = state.stairs.filter((stair) => stair.id !== params.stairId)
  },
}

const moveStairHandler: CommandHandler<Project, MoveStairParams> = {
  apply(state, params) {
    state.stairs = state.stairs.map((stair) =>
      stair.id === params.stairId ? { ...stair, position: params.position } : stair,
    )
  },
}

export function registerStairCommands(
  registry: CommandRegistry<Project>,
): CommandRegistry<Project> {
  return registry
    .register(ADD_STAIR, addStairHandler)
    .register(REMOVE_STAIR, removeStairHandler)
    .register(MOVE_STAIR, moveStairHandler)
}
