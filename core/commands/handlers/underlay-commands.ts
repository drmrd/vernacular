import type { Floor, Project, Underlay, UnderlayPlacement } from '../../model/types'
import type { Command, CommandHandler } from '../command'
import type { CommandRegistry } from '../command-registry'

// Applies `update` to the floor whose id matches `floorId`, leaving all other floors
// reference-equal. Reassigns state.floors so the inverse-capture proxy (ADR-0005) records
// the slice replacement and the dispatcher can capture the inverse for undo.
function mapTargetFloor(state: Project, floorId: string, update: (floor: Floor) => Floor): void {
  state.floors = state.floors.map((floor) => (floor.id === floorId ? update(floor) : floor))
}

// Returns a new floor whose underlay matching `underlayId` is replaced by `update(underlay)`;
// all other underlays are reference-equal.
function mapTargetUnderlay(
  floor: Floor,
  underlayId: string,
  update: (underlay: Underlay) => Underlay,
): Floor {
  return {
    ...floor,
    underlays: floor.underlays.map((underlay) =>
      underlay.id === underlayId ? update(underlay) : underlay,
    ),
  }
}

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

const placeUnderlayHandler: CommandHandler<Project, PlaceUnderlayParams> = {
  apply(state, params) {
    mapTargetFloor(state, params.floorId, (floor) => ({
      ...floor,
      underlays: [...floor.underlays, params.underlay],
    }))
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
    mapTargetFloor(state, params.floorId, (floor) =>
      mapTargetUnderlay(floor, params.underlayId, (underlay) => ({
        ...underlay,
        placement: params.placement,
      })),
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

const setUnderlayOpacityHandler: CommandHandler<Project, SetUnderlayOpacityParams> = {
  apply(state, params) {
    mapTargetFloor(state, params.floorId, (floor) =>
      mapTargetUnderlay(floor, params.underlayId, (underlay) => ({
        ...underlay,
        opacity: params.opacity,
      })),
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

const setUnderlayVisibilityHandler: CommandHandler<Project, SetUnderlayVisibilityParams> = {
  apply(state, params) {
    mapTargetFloor(state, params.floorId, (floor) =>
      mapTargetUnderlay(floor, params.underlayId, (underlay) => ({
        ...underlay,
        visible: params.visible,
      })),
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

const removeUnderlayHandler: CommandHandler<Project, RemoveUnderlayParams> = {
  apply(state, params) {
    mapTargetFloor(state, params.floorId, (floor) => ({
      ...floor,
      underlays: floor.underlays.filter((underlay) => underlay.id !== params.underlayId),
    }))
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
