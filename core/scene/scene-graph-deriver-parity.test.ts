import { describe, expect, it } from 'vitest'
import {
  createDimension,
  createEmptyProject,
  createFloor,
  createFurnitureInstance,
  createOpening,
  createStair,
  createUnderlay,
  createWall,
} from '../model/factories'
import type { Floor, Project } from '../model/types'
import { ROOM_ID_PREFIX } from '../topology/rooms'
import { deriveSceneGraph } from './scene-graph'
import { createSceneGraphDeriver } from './scene-graph-deriver'

const RAISED_FOUNDATION_GRADE_MM = -600
const DAYLIGHT_BASEMENT_GRADE_MM = -1800
const PARLOR_CEILING_HEIGHT_MM = 3200
const TALLER_PARLOR_CEILING_HEIGHT_MM = 3400
const TALLER_DEFAULT_CEILING_HEIGHT_MM = 3600
const MOVED_SOFA_POSITION = { x: 2500, y: 1100 }
const WIDER_DOOR_WIDTH_MM = 900
const TRACING_IMAGE = { scope: 'project', contentHash: 'tracec0de' } as const
const TRACING_SIZE_PX = 800

/**
 * A ground floor with a closed wall loop (so one room is derived), a door, a sofa, an underlay
 * (`u1`), and a dimension (`d1`). Room overrides live on the project, not the floor, so
 * `twoStoreyProject` adds them.
 */
function furnishedGroundFloor(): Floor {
  const ground = createFloor('Ground', {
    id: 'g',
    walls: [
      createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, { id: 'w-south' }),
      createWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 }, { id: 'w-east' }),
      createWall({ x: 4000, y: 3000 }, { x: 0, y: 3000 }, { id: 'w-north' }),
      createWall({ x: 0, y: 3000 }, { x: 0, y: 0 }, { id: 'w-west' }),
    ],
  })
  const door = createOpening({
    type: 'single-swing-door',
    hostWallId: 'w-south',
    position: 1000,
    width: 800,
    id: 'o1',
  })
  const sofa = createFurnitureInstance({
    id: 'sofa-1',
    assetRef: { scope: 'project', contentHash: 'sofac0de' },
    position: { x: 1500, y: 900 },
    footprint: { width: 2000, depth: 900 },
    rotation: 30,
    elevationZ: 50,
    height: 800,
  })
  const underlay = {
    ...createUnderlay({ image: TRACING_IMAGE, width: TRACING_SIZE_PX, height: TRACING_SIZE_PX }),
    id: 'u1',
  }
  const dimension = createDimension({
    start: { x: 0, y: 0 },
    end: { x: 4000, y: 0 },
    offset: 300,
    id: 'd1',
  })
  return {
    ...ground,
    openings: [door],
    furniture: [sofa],
    underlays: [underlay],
    dimensions: [dimension],
  }
}

function twoStoreyProject(): Project {
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.1.0',
  })
  project.floors = [furnishedGroundFloor(), createFloor('Upper', { id: 'u', elevation: 2800 })]
  project.stairs = [createStair({ id: 's1', connection: { fromFloorId: 'g', toFloorId: 'u' } })]
  const [room] = deriveSceneGraph(project).rooms
  const roomKey = room!.id.slice(ROOM_ID_PREFIX.length)
  project.roomOverrides = { [roomKey]: { name: 'Parlor', ceilingHeight: PARLOR_CEILING_HEIGHT_MM } }
  return project
}

function withGround(project: Project, change: (ground: Floor) => Floor): Project {
  const [ground, ...upperFloors] = project.floors
  return { ...project, floors: [change(ground!), ...upperFloors] }
}

function withParlorOverride(
  project: Project,
  change: Partial<{ name: string; ceilingHeight: number }>,
): Project {
  const [roomKey] = Object.keys(project.roomOverrides!)
  return {
    ...project,
    roomOverrides: { [roomKey!]: { ...project.roomOverrides![roomKey!], ...change } },
  }
}

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

  it('returns the same fields as the pure projection on a cold and on a warm deriver', () => {
    const derive = createSceneGraphDeriver()
    const cold = Object.keys(derive(project)).sort()
    const warm = Object.keys(derive(project)).sort()

    expect(cold).toEqual(Object.keys(deriveSceneGraph(project)).sort())
    expect(warm).toEqual(cold)
  })
})

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
        underlays: [
          ...ground.underlays,
          {
            ...createUnderlay({
              image: TRACING_IMAGE,
              width: TRACING_SIZE_PX,
              height: TRACING_SIZE_PX,
            }),
            id: 'u2',
          },
        ],
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
        dimensions: [
          ...ground.dimensions,
          createDimension({ start: { x: 0, y: 3000 }, end: { x: 4000, y: 3000 }, id: 'd2' }),
        ],
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
