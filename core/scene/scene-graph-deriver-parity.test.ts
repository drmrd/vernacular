import { describe, expect, it } from 'vitest'
import type { Floor, Point, Project, Wall } from '../model/types'
import { ROOM_ID_PREFIX } from '../topology/rooms'
import { deriveSceneGraph } from './scene-graph'
import { createSceneGraphDeriver } from './scene-graph-deriver'
import {
  PARLOR_CEILING_HEIGHT_MM,
  PARLOR_NAME,
  createRoomDimension,
  createTracingUnderlay,
  parlorRoomKey,
  twoStoreyProject,
  withGround,
  withParlorOverride,
} from './scene-graph-parity-fixtures'

const RAISED_FOUNDATION_GRADE_MM = -600
const DAYLIGHT_BASEMENT_GRADE_MM = -1800
const TALLER_PARLOR_CEILING_HEIGHT_MM = 3400
const TALLER_DEFAULT_CEILING_HEIGHT_MM = 3600
const MOVED_SOFA_POSITION = { x: 2500, y: 1100 }
const WIDER_DOOR_WIDTH_MM = 900
const RENAMED_GROUND_ID = 'g2'
const NORTH_WALL_MOVE_MM = 500
const NORTH_WALL_ID = 'w-north'

// Equality alone cannot show that a path sets the room side: both could omit it.
describe('the room side of the door on the wall of a closed room', () => {
  it('is on the positive side in the pure projection', () => {
    const graph = deriveSceneGraph(twoStoreyProject())

    expect(graph.openings.map((opening) => opening.roomSide)).toEqual(['positive'])
  })

  it('is on the positive side in the cold deriver', () => {
    const graph = createSceneGraphDeriver()(twoStoreyProject())

    expect(graph.openings.map((opening) => opening.roomSide)).toEqual(['positive'])
  })
})

// These parity tests compare a fresh deriver with the pure projection, or follow one grade edit.
describe('createSceneGraphDeriver parity with deriveSceneGraph', () => {
  it('derives the same scene graph as the pure projection when a site grade is set', () => {
    const project = { ...twoStoreyProject(), site: { gradeElevation: RAISED_FOUNDATION_GRADE_MM } }

    expect(createSceneGraphDeriver()(project)).toStrictEqual(deriveSceneGraph(project))
  })

  it('derives the same scene graph as the pure projection when no site grade is set', () => {
    const project = twoStoreyProject()

    expect(createSceneGraphDeriver()(project)).toStrictEqual(deriveSceneGraph(project))
  })

  it('follows a site grade edit that keeps every floor reference', () => {
    const project = { ...twoStoreyProject(), site: { gradeElevation: RAISED_FOUNDATION_GRADE_MM } }
    const derive = createSceneGraphDeriver()
    derive(project)

    const regraded = { ...project, site: { gradeElevation: DAYLIGHT_BASEMENT_GRADE_MM } }

    expect(derive(regraded).gradeElevation).toBe(DAYLIGHT_BASEMENT_GRADE_MM)
  })
})

describe('a warm createSceneGraphDeriver after a change of the rooms', () => {
  it('derives the same scene graph as the pure projection when a wall of the room is removed', () => {
    const project = twoStoreyProject()
    const derive = createSceneGraphDeriver()
    derive(project)

    const [ground, ...upperFloors] = project.floors
    const withoutNorth: Floor = {
      ...ground!,
      walls: ground!.walls.filter((wall) => wall.id !== 'w-north'),
    }
    const edited = { ...project, floors: [withoutNorth, ...upperFloors] }

    expect(derive(edited)).toStrictEqual(deriveSceneGraph(edited))
  })
})

describe('the scene graph of a project that fills every field', () => {
  const project = { ...twoStoreyProject(), site: { gradeElevation: RAISED_FOUNDATION_GRADE_MM } }

  it('fills every field of the scene graph', () => {
    const entries = Object.entries(deriveSceneGraph(project))

    expect(entries.length).toBeGreaterThan(0)
    for (const [field, value] of entries) {
      if (Array.isArray(value)) {
        expect({ field, count: value.length }).not.toEqual({ field, count: 0 })
      } else {
        expect({ field, type: typeof value }).toEqual({ field, type: 'number' })
      }
    }
  })

  it('applies the room override of the fixture to the room it targets', () => {
    const roomId = ROOM_ID_PREFIX + parlorRoomKey(project)
    const room = deriveSceneGraph(project).rooms.find((node) => node.id === roomId)

    expect(room).toMatchObject({ name: PARLOR_NAME, ceilingHeight: PARLOR_CEILING_HEIGHT_MM })
  })

  it('returns the same fields as the pure projection on a cold and on a warm deriver', () => {
    const derive = createSceneGraphDeriver()
    const cold = Object.keys(derive(project)).sort()
    const warm = Object.keys(derive(project)).sort()

    expect(cold).toEqual(Object.keys(deriveSceneGraph(project)).sort())
    expect(warm).toEqual(cold)
  })
})

function moveNorthWithItsNeighborEnds(wall: Wall): Wall {
  const north = (point: Point): Point => ({ x: point.x, y: point.y + NORTH_WALL_MOVE_MM })
  if (wall.id === NORTH_WALL_ID) {
    return { ...wall, start: north(wall.start), end: north(wall.end) }
  }
  if (wall.id === 'w-east') {
    return { ...wall, end: north(wall.end) }
  }
  if (wall.id === 'w-west') {
    return { ...wall, start: north(wall.start) }
  }
  return wall
}

const EDITS_OF_ONE_KIND: ReadonlyArray<readonly [string, (project: Project) => Project]> = [
  ['a room is renamed', (project) => withParlorOverride(project, { name: 'Morning room' })],
  [
    'the room ceiling height override changes',
    (project) => withParlorOverride(project, { ceilingHeight: TALLER_PARLOR_CEILING_HEIGHT_MM }),
  ],
  [
    'an underlay is added',
    (project) =>
      withGround(project, (ground) => ({
        ...ground,
        underlays: [...ground.underlays, createTracingUnderlay('u2')],
      })),
  ],
  [
    'an underlay is hidden',
    (project) =>
      withGround(project, (ground) => ({
        ...ground,
        underlays: ground.underlays.map((underlay) => ({ ...underlay, visible: false })),
      })),
  ],
  [
    'a dimension is added',
    (project) =>
      withGround(project, (ground) => ({
        ...ground,
        dimensions: [...ground.dimensions, createRoomDimension('d2', true)],
      })),
  ],
  [
    'the sofa moves',
    (project) =>
      withGround(project, (ground) => ({
        ...ground,
        furniture: ground.furniture.map((item) => ({ ...item, position: MOVED_SOFA_POSITION })),
      })),
  ],
  [
    'the door widens',
    (project) =>
      withGround(project, (ground) => ({
        ...ground,
        openings: ground.openings.map((opening) => ({ ...opening, width: WIDER_DOOR_WIDTH_MM })),
      })),
  ],
  [
    'the site grade changes',
    (project) => ({ ...project, site: { gradeElevation: DAYLIGHT_BASEMENT_GRADE_MM } }),
  ],
  [
    'a wall takes a construction profile',
    (project) =>
      withGround(project, (ground) => ({
        ...ground,
        walls: ground.walls.map((wall) =>
          wall.id === 'w-south' ? { ...wall, constructionProfile: 'solid-masonry-brick' } : wall,
        ),
      })),
  ],
  [
    'a wall moves',
    (project) =>
      withGround(project, (ground) => ({
        ...ground,
        walls: ground.walls.map(moveNorthWithItsNeighborEnds),
      })),
  ],
  [
    'the floor default ceiling height rises',
    (project) =>
      withGround(project, (ground) => ({
        ...ground,
        defaultCeilingHeight: TALLER_DEFAULT_CEILING_HEIGHT_MM,
      })),
  ],
]

describe('a warm createSceneGraphDeriver after an edit of one kind', () => {
  it.each(EDITS_OF_ONE_KIND)(
    'derives the same scene graph as the pure projection after %s',
    (_name, edit) => {
      const project = twoStoreyProject()
      const derive = createSceneGraphDeriver()
      derive(project)
      const edited = edit(project)

      expect(derive(edited)).toStrictEqual(deriveSceneGraph(edited))
    },
  )
})

describe('a warm createSceneGraphDeriver after the ground floor takes another id', () => {
  it('derives the same scene graph as the pure projection', () => {
    const project = twoStoreyProject()
    const derive = createSceneGraphDeriver()
    derive(project)

    const renamed = withGround(project, (ground) => ({ ...ground, id: RENAMED_GROUND_ID }))
    const edited = {
      ...renamed,
      stairs: project.stairs.map((stair) => ({
        ...stair,
        connection: { ...stair.connection, fromFloorId: RENAMED_GROUND_ID },
      })),
    }

    expect(derive(edited)).toStrictEqual(deriveSceneGraph(edited))
  })
})
