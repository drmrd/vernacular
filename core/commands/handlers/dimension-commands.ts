import type { Dimension, Project } from '../../model/types'
import type { Command, CommandHandler } from '../command'
import type { CommandRegistry } from '../command-registry'
import { mapTargetFloor } from './map-target-floor'

export const ADD_DIMENSION = 'floor/add-dimension'

export interface AddDimensionParams {
  floorId: string
  dimension: Dimension
}

export function addDimension(floorId: string, dimension: Dimension): Command<AddDimensionParams> {
  return {
    type: ADD_DIMENSION,
    params: { floorId, dimension },
    description: 'Add dimension',
  }
}

const addDimensionHandler: CommandHandler<Project, AddDimensionParams> = {
  apply(state, params) {
    mapTargetFloor(state, params.floorId, (floor) => ({
      ...floor,
      dimensions: [...floor.dimensions, params.dimension],
    }))
  },
}

export const REMOVE_DIMENSION = 'floor/remove-dimension'

export interface RemoveDimensionParams {
  floorId: string
  dimensionId: string
}

export function removeDimension(
  floorId: string,
  dimensionId: string,
): Command<RemoveDimensionParams> {
  return {
    type: REMOVE_DIMENSION,
    params: { floorId, dimensionId },
    description: 'Remove dimension',
  }
}

const removeDimensionHandler: CommandHandler<Project, RemoveDimensionParams> = {
  apply(state, params) {
    mapTargetFloor(state, params.floorId, (floor) => ({
      ...floor,
      dimensions: floor.dimensions.filter((dimension) => dimension.id !== params.dimensionId),
    }))
  },
}

export function registerDimensionCommands(
  registry: CommandRegistry<Project>,
): CommandRegistry<Project> {
  return registry
    .register(ADD_DIMENSION, addDimensionHandler)
    .register(REMOVE_DIMENSION, removeDimensionHandler)
}
