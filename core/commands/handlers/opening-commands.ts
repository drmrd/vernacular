import type { Floor, Opening, Project } from '../../model/types'
import type { Command, CommandHandler } from '../command'
import type { CommandRegistry } from '../command-registry'
import { mapTargetFloor } from './map-target-floor'

// Returns a new floor whose opening matching `openingId` is replaced by `update(opening)`;
// all other openings are reference-equal.
function mapTargetOpening(
  floor: Floor,
  openingId: string,
  update: (opening: Opening) => Opening,
): Floor {
  return {
    ...floor,
    openings: floor.openings.map((opening) =>
      opening.id === openingId ? update(opening) : opening,
    ),
  }
}

export type OpeningOrientationAxis = 'hinge' | 'facing'

export interface OpeningDimensions {
  width: number
  height: number
  sillHeight: number
}

export const PLACE_OPENING = 'floor/place-opening'

export interface PlaceOpeningParams {
  floorId: string
  opening: Opening
}

export function placeOpening(floorId: string, opening: Opening): Command<PlaceOpeningParams> {
  return {
    type: PLACE_OPENING,
    params: { floorId, opening },
    description: 'Place opening',
  }
}

const placeOpeningHandler: CommandHandler<Project, PlaceOpeningParams> = {
  apply(state, params) {
    mapTargetFloor(state, params.floorId, (floor) => ({
      ...floor,
      openings: [...floor.openings, params.opening],
    }))
  },
}

export const MOVE_OPENING = 'floor/move-opening'

export interface MoveOpeningParams {
  floorId: string
  openingId: string
  position: number
}

export function moveOpening(
  floorId: string,
  openingId: string,
  position: number,
): Command<MoveOpeningParams> {
  return {
    type: MOVE_OPENING,
    params: { floorId, openingId, position },
    description: 'Move opening',
  }
}

const moveOpeningHandler: CommandHandler<Project, MoveOpeningParams> = {
  apply(state, params) {
    mapTargetFloor(state, params.floorId, (floor) =>
      mapTargetOpening(floor, params.openingId, (opening) => ({
        ...opening,
        position: params.position,
      })),
    )
  },
}

export const RESIZE_OPENING = 'floor/resize-opening'

export interface ResizeOpeningParams {
  floorId: string
  openingId: string
  dimensions: OpeningDimensions
}

export function resizeOpening(
  floorId: string,
  openingId: string,
  dimensions: OpeningDimensions,
): Command<ResizeOpeningParams> {
  return {
    type: RESIZE_OPENING,
    params: { floorId, openingId, dimensions },
    description: 'Resize opening',
  }
}

const resizeOpeningHandler: CommandHandler<Project, ResizeOpeningParams> = {
  apply(state, params) {
    mapTargetFloor(state, params.floorId, (floor) =>
      mapTargetOpening(floor, params.openingId, (opening) => ({
        ...opening,
        width: params.dimensions.width,
        height: params.dimensions.height,
        sillHeight: params.dimensions.sillHeight,
      })),
    )
  },
}

export const RESIZE_OPENING_EDGE = 'floor/resize-opening-edge'

export interface ResizeOpeningEdgeParams {
  floorId: string
  openingId: string
  width: number
  position: number
}

// eslint-disable-next-line max-params -- floor, opening, the new width, and the new position is the natural signature for dragging one opening edge
export function resizeOpeningEdge(
  floorId: string,
  openingId: string,
  width: number,
  position: number,
): Command<ResizeOpeningEdgeParams> {
  return {
    type: RESIZE_OPENING_EDGE,
    params: { floorId, openingId, width, position },
    description: 'Resize opening',
  }
}

const resizeOpeningEdgeHandler: CommandHandler<Project, ResizeOpeningEdgeParams> = {
  apply(state, params) {
    mapTargetFloor(state, params.floorId, (floor) =>
      mapTargetOpening(floor, params.openingId, (opening) => ({
        ...opening,
        width: params.width,
        position: params.position,
      })),
    )
  },
}

export const FLIP_OPENING = 'floor/flip-opening'

export interface FlipOpeningParams {
  floorId: string
  openingId: string
  axis: OpeningOrientationAxis
}

export function flipOpening(
  floorId: string,
  openingId: string,
  axis: OpeningOrientationAxis,
): Command<FlipOpeningParams> {
  return {
    type: FLIP_OPENING,
    params: { floorId, openingId, axis },
    description: 'Flip opening',
  }
}

function flipOpeningOrientation(opening: Opening, axis: OpeningOrientationAxis): Opening {
  if (axis === 'hinge') {
    return {
      ...opening,
      orientation: {
        ...opening.orientation,
        hinge: opening.orientation.hinge === 'start' ? 'end' : 'start',
      },
    }
  }
  return {
    ...opening,
    orientation: {
      ...opening.orientation,
      facing: opening.orientation.facing === 'positive' ? 'negative' : 'positive',
    },
  }
}

const flipOpeningHandler: CommandHandler<Project, FlipOpeningParams> = {
  apply(state, params) {
    mapTargetFloor(state, params.floorId, (floor) =>
      mapTargetOpening(floor, params.openingId, (opening) =>
        flipOpeningOrientation(opening, params.axis),
      ),
    )
  },
}

export const REMOVE_OPENING = 'floor/remove-opening'

export interface RemoveOpeningParams {
  floorId: string
  openingId: string
}

export function removeOpening(floorId: string, openingId: string): Command<RemoveOpeningParams> {
  return {
    type: REMOVE_OPENING,
    params: { floorId, openingId },
    description: 'Remove opening',
  }
}

const removeOpeningHandler: CommandHandler<Project, RemoveOpeningParams> = {
  apply(state, params) {
    mapTargetFloor(state, params.floorId, (floor) => ({
      ...floor,
      openings: floor.openings.filter((opening) => opening.id !== params.openingId),
    }))
  },
}

export function registerOpeningCommands(
  registry: CommandRegistry<Project>,
): CommandRegistry<Project> {
  return registry
    .register(PLACE_OPENING, placeOpeningHandler)
    .register(MOVE_OPENING, moveOpeningHandler)
    .register(RESIZE_OPENING, resizeOpeningHandler)
    .register(RESIZE_OPENING_EDGE, resizeOpeningEdgeHandler)
    .register(FLIP_OPENING, flipOpeningHandler)
    .register(REMOVE_OPENING, removeOpeningHandler)
}
