import type { Project, Underlay, UnderlayPlacement } from '../../model/types'
import type { Command, CommandHandler } from '../command'
import type { CommandRegistry } from '../command-registry'

export const PLACE_UNDERLAY = 'floor/place-underlay'

export interface PlaceUnderlayParams {
  floorId: string
  underlay: Underlay
}

export function placeUnderlay(floorId: string, underlay: Underlay): Command<PlaceUnderlayParams> {
  return {
    type: PLACE_UNDERLAY,
    params: { floorId, underlay },
    description: 'Place underlay',
  }
}

// Reassigns the whole floors slice because the inverse-capture proxy records
// only the root's top-level properties; the edited floor becomes a new object
// while untouched floors keep their reference for entity-keyed dirty tracking.
const placeUnderlayHandler: CommandHandler<Project, PlaceUnderlayParams> = {
  apply(state, params) {
    state.floors = state.floors.map((floor) =>
      floor.id === params.floorId
        ? { ...floor, underlays: [...floor.underlays, params.underlay] }
        : floor,
    )
  },
}

export const CALIBRATE_UNDERLAY = 'floor/calibrate-underlay'

export interface CalibrateUnderlayParams {
  floorId: string
  underlayId: string
  placement: UnderlayPlacement
}

export function calibrateUnderlay(
  floorId: string,
  underlayId: string,
  placement: UnderlayPlacement,
): Command<CalibrateUnderlayParams> {
  return {
    type: CALIBRATE_UNDERLAY,
    params: { floorId, underlayId, placement },
    description: 'Calibrate underlay',
  }
}

const calibrateUnderlayHandler: CommandHandler<Project, CalibrateUnderlayParams> = {
  apply(state, params) {
    state.floors = state.floors.map((floor) =>
      floor.id === params.floorId
        ? {
            ...floor,
            underlays: floor.underlays.map((underlay) =>
              underlay.id === params.underlayId
                ? { ...underlay, placement: params.placement }
                : underlay,
            ),
          }
        : floor,
    )
  },
}

export function registerUnderlayCommands(
  registry: CommandRegistry<Project>,
): CommandRegistry<Project> {
  return registry
    .register(PLACE_UNDERLAY, placeUnderlayHandler)
    .register(CALIBRATE_UNDERLAY, calibrateUnderlayHandler)
}
