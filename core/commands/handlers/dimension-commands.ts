import type { Dimension, Floor, Project } from '../../model/types'
import type { Command, CommandHandler } from '../command'
import type { CommandRegistry } from '../command-registry'

// Applies `update` to the floor whose id matches `floorId`, leaving all other floors
// reference-equal. Reassigns state.floors so the inverse-capture proxy (ADR-0005) records
// the slice replacement and the dispatcher can capture the inverse for undo.
function mapTargetFloor(state: Project, floorId: string, update: (floor: Floor) => Floor): void {
  state.floors = state.floors.map((floor) => (floor.id === floorId ? update(floor) : floor))
}

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
