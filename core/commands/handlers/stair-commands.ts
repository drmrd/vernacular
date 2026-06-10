import type { Project, Stair } from '../../model/types'
import type { Command, CommandHandler } from '../command'
import type { CommandRegistry } from '../command-registry'

export const ADD_STAIR = 'project/add-stair'
export const REMOVE_STAIR = 'project/remove-stair'

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

export function registerStairCommands(
  registry: CommandRegistry<Project>,
): CommandRegistry<Project> {
  return registry.register(ADD_STAIR, addStairHandler).register(REMOVE_STAIR, removeStairHandler)
}
