import { describe, it, expect } from 'vitest'
import { ADD_STAIR, createFloor, type AddStairParams, type Command, type Floor } from '../../core'
import { stairPlacementCommand } from './place-stair'

const GROUND_ELEVATION_MM = 0
const UPPER_ELEVATION_MM = 2700
const TOP_ELEVATION_MM = 5400
const WORLD = { x: 1000, y: 2000 }

function floor(id: string, elevation: number): Floor {
  return createFloor(id, { id, elevation })
}

function paramsOf(command: Command | null): AddStairParams {
  return command?.params as AddStairParams
}

describe('stairPlacementCommand', () => {
  it('adds a stair connecting the active floor to the floor directly above it', () => {
    const floors = [floor('ground', GROUND_ELEVATION_MM), floor('upper', UPPER_ELEVATION_MM)]

    const command = stairPlacementCommand(floors, 'ground', WORLD)

    expect(command?.type).toBe(ADD_STAIR)
    const { stair } = paramsOf(command)
    expect(stair.connection).toEqual({ fromFloorId: 'ground', toFloorId: 'upper' })
    expect(stair.position).toEqual(WORLD)
  })

  it('connects to the nearest floor above when several floors are higher', () => {
    const floors = [
      floor('ground', GROUND_ELEVATION_MM),
      floor('top', TOP_ELEVATION_MM),
      floor('upper', UPPER_ELEVATION_MM),
    ]

    const command = stairPlacementCommand(floors, 'ground', WORLD)

    expect(paramsOf(command).stair.connection.toFloorId).toBe('upper')
  })

  it('returns null when the active floor is already the topmost floor', () => {
    const floors = [floor('ground', GROUND_ELEVATION_MM), floor('upper', UPPER_ELEVATION_MM)]

    expect(stairPlacementCommand(floors, 'upper', WORLD)).toBeNull()
  })

  it('returns null when no floor is active', () => {
    const floors = [floor('ground', GROUND_ELEVATION_MM)]

    expect(stairPlacementCommand(floors, null, WORLD)).toBeNull()
  })
})
