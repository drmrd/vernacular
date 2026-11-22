import { describe, expect, it } from 'vitest'
import {
  createEmptyProject,
  createFloor,
  createOpening,
  createWall,
  deriveSceneGraph,
  entranceOf,
  entranceRoleOf,
  type Entrance,
} from '../index'

const GROUND_FLOOR_ID = 'ground'
const DOOR_ID = 'front-door'
const ROOM_SIZE = 4000

/** A walled room on one floor with one door, optionally carrying the mark. */
function entranceOfRoomWithDoor(marked: boolean): Entrance {
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.1.0',
  })
  const walls = [
    createWall({ x: 0, y: 0 }, { x: ROOM_SIZE, y: 0 }, { id: 'south' }),
    createWall({ x: ROOM_SIZE, y: 0 }, { x: ROOM_SIZE, y: ROOM_SIZE }, { id: 'east' }),
    createWall({ x: ROOM_SIZE, y: ROOM_SIZE }, { x: 0, y: ROOM_SIZE }, { id: 'north' }),
    createWall({ x: 0, y: ROOM_SIZE }, { x: 0, y: 0 }, { id: 'west' }),
  ]
  const door = createOpening({
    id: DOOR_ID,
    type: 'single-swing-door',
    hostWallId: 'south',
    position: ROOM_SIZE / 2,
  })
  project.floors = [
    {
      ...createFloor('Ground', { id: GROUND_FLOOR_ID, walls }),
      openings: [marked ? { ...door, entrance: true } : door],
    },
  ]
  return entranceOf(deriveSceneGraph(project))
}

describe('entranceRoleOf', () => {
  it('names the door the owner marked as marked', () => {
    const entrance = entranceOfRoomWithDoor(true)

    expect(entranceRoleOf(entrance, GROUND_FLOOR_ID, DOOR_ID)).toBe('marked')
  })

  it('names the door that a rule picked as guessed', () => {
    const entrance = entranceOfRoomWithDoor(false)

    expect(entranceRoleOf(entrance, GROUND_FLOOR_ID, DOOR_ID)).toBe('guessed')
  })

  it('names any other opening as other', () => {
    const entrance = entranceOfRoomWithDoor(true)

    expect(entranceRoleOf(entrance, GROUND_FLOOR_ID, 'some-other-door')).toBe('other')
  })

  it('names an opening with the same id on another floor as other', () => {
    const entrance = entranceOfRoomWithDoor(true)

    expect(entranceRoleOf(entrance, 'upper', DOOR_ID)).toBe('other')
  })

  it('names every opening as other when the project has no entrance door', () => {
    const entrance = entranceOfRoomWithDoor(false)
    const withoutDoor: Entrance = { ...entrance, door: undefined, source: 'none' }

    expect(entranceRoleOf(withoutDoor, GROUND_FLOOR_ID, DOOR_ID)).toBe('other')
  })
})
