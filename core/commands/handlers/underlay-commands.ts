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

// Reassigns state.floors for the same inverse-capture reason as placeUnderlayHandler above (ADR-0005).
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

export const SET_UNDERLAY_OPACITY = 'floor/set-underlay-opacity'

export interface SetUnderlayOpacityParams {
  floorId: string
  underlayId: string
  opacity: number
}

export function setUnderlayOpacity(
  floorId: string,
  underlayId: string,
  opacity: number,
): Command<SetUnderlayOpacityParams> {
  return {
    type: SET_UNDERLAY_OPACITY,
    params: { floorId, underlayId, opacity },
    description: 'Set underlay opacity',
  }
}

// Reassigns state.floors for the same inverse-capture reason as placeUnderlayHandler above (ADR-0005).
const setUnderlayOpacityHandler: CommandHandler<Project, SetUnderlayOpacityParams> = {
  apply(state, params) {
    state.floors = state.floors.map((floor) =>
      floor.id === params.floorId
        ? {
            ...floor,
            underlays: floor.underlays.map((underlay) =>
              underlay.id === params.underlayId
                ? { ...underlay, opacity: params.opacity }
                : underlay,
            ),
          }
        : floor,
    )
  },
}

export const SET_UNDERLAY_VISIBILITY = 'floor/set-underlay-visibility'

export interface SetUnderlayVisibilityParams {
  floorId: string
  underlayId: string
  visible: boolean
}

export function setUnderlayVisibility(
  floorId: string,
  underlayId: string,
  visible: boolean,
): Command<SetUnderlayVisibilityParams> {
  return {
    type: SET_UNDERLAY_VISIBILITY,
    params: { floorId, underlayId, visible },
    description: 'Set underlay visibility',
  }
}

// Reassigns state.floors for the same inverse-capture reason as placeUnderlayHandler above (ADR-0005).
const setUnderlayVisibilityHandler: CommandHandler<Project, SetUnderlayVisibilityParams> = {
  apply(state, params) {
    state.floors = state.floors.map((floor) =>
      floor.id === params.floorId
        ? {
            ...floor,
            underlays: floor.underlays.map((underlay) =>
              underlay.id === params.underlayId
                ? { ...underlay, visible: params.visible }
                : underlay,
            ),
          }
        : floor,
    )
  },
}

export const REMOVE_UNDERLAY = 'floor/remove-underlay'

export interface RemoveUnderlayParams {
  floorId: string
  underlayId: string
}

export function removeUnderlay(floorId: string, underlayId: string): Command<RemoveUnderlayParams> {
  return {
    type: REMOVE_UNDERLAY,
    params: { floorId, underlayId },
    description: 'Remove underlay',
  }
}

// Reassigns state.floors for the same inverse-capture reason as placeUnderlayHandler above (ADR-0005).
const removeUnderlayHandler: CommandHandler<Project, RemoveUnderlayParams> = {
  apply(state, params) {
    state.floors = state.floors.map((floor) =>
      floor.id === params.floorId
        ? {
            ...floor,
            underlays: floor.underlays.filter((underlay) => underlay.id !== params.underlayId),
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
    .register(SET_UNDERLAY_OPACITY, setUnderlayOpacityHandler)
    .register(SET_UNDERLAY_VISIBILITY, setUnderlayVisibilityHandler)
    .register(REMOVE_UNDERLAY, removeUnderlayHandler)
}
