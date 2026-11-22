import type { Project } from '../../model/types'
import { openingKindOfType } from '../../registries/opening-kind'
import type { Command, CommandHandler } from '../command'
import type { CommandRegistry } from '../command-registry'
import { withoutEntranceMark } from '../entrance-rule'

export const MARK_MAIN_ENTRANCE = 'project/mark-main-entrance'

export interface MarkMainEntranceParams {
  floorId: string
  openingId: string
}

export function markMainEntrance(
  floorId: string,
  openingId: string,
): Command<MarkMainEntranceParams> {
  return {
    type: MARK_MAIN_ENTRANCE,
    params: { floorId, openingId },
    description: 'Mark main entrance',
  }
}

const markMainEntranceHandler: CommandHandler<Project, MarkMainEntranceParams> = {
  apply(state, params) {
    const target = state.floors
      .find((floor) => floor.id === params.floorId)
      ?.openings.find((opening) => opening.id === params.openingId)
    if (target === undefined || openingKindOfType(target.type) !== 'door') {
      return
    }
    // Reassign the whole floors slice so the inverse-capture proxy records the
    // root-level change and undo restores every earlier mark in one step.
    state.floors = state.floors.map((floor) => ({
      ...floor,
      openings: floor.openings.map((opening) =>
        floor.id === params.floorId && opening.id === params.openingId
          ? { ...opening, entrance: true as const }
          : withoutEntranceMark(opening),
      ),
    }))
  },
}

export const CLEAR_MAIN_ENTRANCE = 'project/clear-main-entrance'

export function clearMainEntrance(): Command<Record<string, never>> {
  return { type: CLEAR_MAIN_ENTRANCE, params: {}, description: 'Clear main entrance' }
}

const clearMainEntranceHandler: CommandHandler<Project, Record<string, never>> = {
  apply(state) {
    state.floors = state.floors.map((floor) => ({
      ...floor,
      openings: floor.openings.map(withoutEntranceMark),
    }))
  },
}

export function registerEntranceCommands(
  registry: CommandRegistry<Project>,
): CommandRegistry<Project> {
  return registry
    .register(MARK_MAIN_ENTRANCE, markMainEntranceHandler)
    .register(CLEAR_MAIN_ENTRANCE, clearMainEntranceHandler)
}
