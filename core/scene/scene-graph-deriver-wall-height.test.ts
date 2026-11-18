import { describe, expect, it } from 'vitest'
import { CommandRegistry } from '../commands/command-registry'
import { Dispatcher } from '../commands/dispatcher'
import {
  registerProjectCommands,
  setFloorCeilingHeight,
} from '../commands/handlers/project-commands'
import { createEmptyProject, createFloor, createWall } from '../model/factories'
import type { Floor, Project } from '../model/types'
import { deriveSceneGraph } from './scene-graph'
import { createSceneGraphDeriver } from './scene-graph-deriver'

const OLD_CEILING_HEIGHT = 2438
const NEW_CEILING_HEIGHT = 4000
const ROOM_WIDTH = 4000
const ROOM_DEPTH = 3000
const WALL_COUNT = 4

function closedRoomFloor(id: string, ceilingHeight: number): Floor {
  const floor = createFloor('Ground', {
    id,
    walls: [
      createWall({ x: 0, y: 0 }, { x: ROOM_WIDTH, y: 0 }, { id: 'w-south' }),
      createWall({ x: ROOM_WIDTH, y: 0 }, { x: ROOM_WIDTH, y: ROOM_DEPTH }, { id: 'w-east' }),
      createWall({ x: ROOM_WIDTH, y: ROOM_DEPTH }, { x: 0, y: ROOM_DEPTH }, { id: 'w-north' }),
      createWall({ x: 0, y: ROOM_DEPTH }, { x: 0, y: 0 }, { id: 'w-west' }),
    ],
  })
  return { ...floor, defaultCeilingHeight: ceilingHeight }
}

function projectWith(floor: Floor): Project {
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.1.0',
  })
  project.floors = [floor]
  return project
}

/** The next project as the ceiling height command makes it: same walls array, same wall objects. */
function withCeilingHeight(project: Project, ceilingHeight: number): Project {
  const [floor] = project.floors
  if (floor === undefined) throw new Error('expected a floor in the project')
  return { ...project, floors: [{ ...floor, defaultCeilingHeight: ceilingHeight }] }
}

describe('a wall node from a warm createSceneGraphDeriver after the ceiling height of its floor changes', () => {
  it('has the new ceiling height of its floor', () => {
    const before = projectWith(closedRoomFloor('a', OLD_CEILING_HEIGHT))
    const derive = createSceneGraphDeriver()
    derive(before)

    const after = derive(withCeilingHeight(before, NEW_CEILING_HEIGHT))

    expect(after.walls).toHaveLength(WALL_COUNT)
    expect(after.walls.map((wall) => wall.height)).toEqual(
      Array(WALL_COUNT).fill(NEW_CEILING_HEIGHT),
    )
  })

  it('has the new ceiling height when the change goes through the set ceiling height command', () => {
    const project = projectWith(closedRoomFloor('a', OLD_CEILING_HEIGHT))
    const dispatcher = new Dispatcher(
      project,
      registerProjectCommands(new CommandRegistry<Project>()),
    )
    const derive = createSceneGraphDeriver()
    derive(project)

    dispatcher.dispatch(setFloorCeilingHeight('a', NEW_CEILING_HEIGHT))
    const after = derive(project)

    expect(after.walls).toHaveLength(WALL_COUNT)
    expect(after.walls.map((wall) => wall.height)).toEqual(
      Array(WALL_COUNT).fill(NEW_CEILING_HEIGHT),
    )
  })

  it('derives the same scene graph as the pure projection', () => {
    const before = projectWith(closedRoomFloor('a', OLD_CEILING_HEIGHT))
    const derive = createSceneGraphDeriver()
    derive(before)
    const after = withCeilingHeight(before, NEW_CEILING_HEIGHT)

    expect(derive(after)).toEqual(deriveSceneGraph(after))
  })

  it('is cached again under the new ceiling height', () => {
    const before = projectWith(closedRoomFloor('a', OLD_CEILING_HEIGHT))
    const derive = createSceneGraphDeriver()
    derive(before)
    const after = withCeilingHeight(before, NEW_CEILING_HEIGHT)

    const first = derive(after)
    const second = derive(after)

    first.walls.forEach((wall, index) => expect(second.walls[index]).toBe(wall))
  })

  it('has the old ceiling height again when the floor returns to it', () => {
    const before = projectWith(closedRoomFloor('a', OLD_CEILING_HEIGHT))
    const derive = createSceneGraphDeriver()
    derive(before)
    const raised = withCeilingHeight(before, NEW_CEILING_HEIGHT)
    derive(raised)

    const restored = derive(withCeilingHeight(raised, OLD_CEILING_HEIGHT))

    expect(restored.walls).toHaveLength(WALL_COUNT)
    expect(restored.walls.map((wall) => wall.height)).toEqual(
      Array(WALL_COUNT).fill(OLD_CEILING_HEIGHT),
    )
  })
})

describe('a wall node from a warm createSceneGraphDeriver', () => {
  it('is the same object when the floor changes but keeps its id and ceiling height', () => {
    const before = projectWith(closedRoomFloor('a', OLD_CEILING_HEIGHT))
    const derive = createSceneGraphDeriver()
    const first = derive(before)
    const [floor] = before.floors
    if (floor === undefined) throw new Error('expected a floor in the project')
    const renamed: Floor = { ...floor, name: 'Parlor floor' }
    expect(renamed.walls).toBe(floor.walls)

    const second = derive({ ...before, floors: [renamed] })

    expect(second.walls).toHaveLength(WALL_COUNT)
    second.walls.forEach((wall, index) => expect(wall).toBe(first.walls[index]))
  })

  it('has the id of the floor that now holds its wall object', () => {
    const before = projectWith(closedRoomFloor('a', OLD_CEILING_HEIGHT))
    const derive = createSceneGraphDeriver()
    derive(before)
    const [floor] = before.floors
    if (floor === undefined) throw new Error('expected a floor in the project')

    const moved = derive(projectWith({ ...floor, id: 'b' }))

    expect(moved.walls).toHaveLength(WALL_COUNT)
    expect(moved.walls.map((wall) => wall.floorId)).toEqual(Array(WALL_COUNT).fill('b'))
  })
})
