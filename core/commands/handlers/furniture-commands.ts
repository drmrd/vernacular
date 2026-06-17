import type {
  Floor,
  FurnitureFootprint,
  FurnitureInstance,
  Point,
  Project,
} from '../../model/types'
import type { Command, CommandHandler } from '../command'
import type { CommandRegistry } from '../command-registry'
import { mapTargetFloor } from './map-target-floor'

// Returns a new floor whose furniture item matching `furnitureId` is replaced by `update(furniture)`;
// all other furniture items are reference-equal.
function mapTargetFurniture(
  floor: Floor,
  furnitureId: string,
  update: (furniture: FurnitureInstance) => FurnitureInstance,
): Floor {
  return {
    ...floor,
    furniture: floor.furniture.map((furniture) =>
      furniture.id === furnitureId ? update(furniture) : furniture,
    ),
  }
}

function withoutName(furniture: FurnitureInstance): FurnitureInstance {
  const copy = { ...furniture }
  delete copy.name
  return copy
}

export const PLACE_FURNITURE = 'floor/place-furniture'

export interface PlaceFurnitureParams {
  floorId: string
  furniture: FurnitureInstance
}

export function placeFurniture(
  floorId: string,
  furniture: FurnitureInstance,
): Command<PlaceFurnitureParams> {
  return {
    type: PLACE_FURNITURE,
    params: { floorId, furniture },
    description: 'Place furniture',
  }
}

const placeFurnitureHandler: CommandHandler<Project, PlaceFurnitureParams> = {
  apply(state, params) {
    mapTargetFloor(state, params.floorId, (floor) => ({
      ...floor,
      furniture: [...floor.furniture, params.furniture],
    }))
  },
}

export const MOVE_FURNITURE = 'floor/move-furniture'

export interface MoveFurnitureParams {
  floorId: string
  furnitureId: string
  position: Point
}

export function moveFurniture(
  floorId: string,
  furnitureId: string,
  position: Point,
): Command<MoveFurnitureParams> {
  return {
    type: MOVE_FURNITURE,
    params: { floorId, furnitureId, position },
    description: 'Move furniture',
  }
}

const moveFurnitureHandler: CommandHandler<Project, MoveFurnitureParams> = {
  apply(state, params) {
    mapTargetFloor(state, params.floorId, (floor) =>
      mapTargetFurniture(floor, params.furnitureId, (furniture) => ({
        ...furniture,
        position: params.position,
      })),
    )
  },
}

export const ROTATE_FURNITURE = 'floor/rotate-furniture'

export interface RotateFurnitureParams {
  floorId: string
  furnitureId: string
  rotation: number
}

export function rotateFurniture(
  floorId: string,
  furnitureId: string,
  rotation: number,
): Command<RotateFurnitureParams> {
  return {
    type: ROTATE_FURNITURE,
    params: { floorId, furnitureId, rotation },
    description: 'Rotate furniture',
  }
}

const rotateFurnitureHandler: CommandHandler<Project, RotateFurnitureParams> = {
  apply(state, params) {
    mapTargetFloor(state, params.floorId, (floor) =>
      mapTargetFurniture(floor, params.furnitureId, (furniture) => ({
        ...furniture,
        rotation: params.rotation,
      })),
    )
  },
}

export const RESIZE_FURNITURE = 'floor/resize-furniture'

export interface ResizeFurnitureParams {
  floorId: string
  furnitureId: string
  footprint: FurnitureFootprint
}

export function resizeFurniture(
  floorId: string,
  furnitureId: string,
  footprint: FurnitureFootprint,
): Command<ResizeFurnitureParams> {
  return {
    type: RESIZE_FURNITURE,
    params: { floorId, furnitureId, footprint },
    description: 'Resize furniture',
  }
}

const resizeFurnitureHandler: CommandHandler<Project, ResizeFurnitureParams> = {
  apply(state, params) {
    mapTargetFloor(state, params.floorId, (floor) =>
      mapTargetFurniture(floor, params.furnitureId, (furniture) => ({
        ...furniture,
        footprint: params.footprint,
      })),
    )
  },
}

export const SET_FURNITURE_HEIGHT = 'floor/set-furniture-height'

export interface SetFurnitureHeightParams {
  floorId: string
  furnitureId: string
  height: number
}

export function setFurnitureHeight(
  floorId: string,
  furnitureId: string,
  height: number,
): Command<SetFurnitureHeightParams> {
  return {
    type: SET_FURNITURE_HEIGHT,
    params: { floorId, furnitureId, height },
    description: 'Set furniture height',
  }
}

const setFurnitureHeightHandler: CommandHandler<Project, SetFurnitureHeightParams> = {
  apply(state, params) {
    mapTargetFloor(state, params.floorId, (floor) =>
      mapTargetFurniture(floor, params.furnitureId, (furniture) => ({
        ...furniture,
        height: params.height,
      })),
    )
  },
}

export const SET_FURNITURE_NAME = 'floor/set-furniture-name'

export interface SetFurnitureNameParams {
  floorId: string
  furnitureId: string
  name: string
}

export function setFurnitureName(
  floorId: string,
  furnitureId: string,
  name: string,
): Command<SetFurnitureNameParams> {
  return {
    type: SET_FURNITURE_NAME,
    params: { floorId, furnitureId, name },
    description: 'Set furniture name',
  }
}

const setFurnitureNameHandler: CommandHandler<Project, SetFurnitureNameParams> = {
  apply(state, params) {
    mapTargetFloor(state, params.floorId, (floor) =>
      mapTargetFurniture(floor, params.furnitureId, (furniture) =>
        params.name === '' ? withoutName(furniture) : { ...furniture, name: params.name },
      ),
    )
  },
}

export const REMOVE_FURNITURE = 'floor/remove-furniture'

export interface RemoveFurnitureParams {
  floorId: string
  furnitureId: string
}

export function removeFurniture(
  floorId: string,
  furnitureId: string,
): Command<RemoveFurnitureParams> {
  return {
    type: REMOVE_FURNITURE,
    params: { floorId, furnitureId },
    description: 'Remove furniture',
  }
}

const removeFurnitureHandler: CommandHandler<Project, RemoveFurnitureParams> = {
  apply(state, params) {
    mapTargetFloor(state, params.floorId, (floor) => ({
      ...floor,
      furniture: floor.furniture.filter((furniture) => furniture.id !== params.furnitureId),
    }))
  },
}

export function registerFurnitureCommands(
  registry: CommandRegistry<Project>,
): CommandRegistry<Project> {
  return registry
    .register(PLACE_FURNITURE, placeFurnitureHandler)
    .register(MOVE_FURNITURE, moveFurnitureHandler)
    .register(ROTATE_FURNITURE, rotateFurnitureHandler)
    .register(RESIZE_FURNITURE, resizeFurnitureHandler)
    .register(SET_FURNITURE_HEIGHT, setFurnitureHeightHandler)
    .register(SET_FURNITURE_NAME, setFurnitureNameHandler)
    .register(REMOVE_FURNITURE, removeFurnitureHandler)
}
