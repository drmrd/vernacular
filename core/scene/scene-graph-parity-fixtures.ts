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
import type { Dimension, Floor, Project, Underlay } from '../model/types'
import { ROOM_ID_PREFIX } from '../topology/rooms'
import { deriveSceneGraph } from './scene-graph'

/** Ceiling height the fixture's room override sets on the parlor. */
export const PARLOR_CEILING_HEIGHT_MM = 3200
/** Name the fixture's room override gives the ground room. */
export const PARLOR_NAME = 'Parlor'

const ROOM_WIDTH_MM = 4000
const ROOM_DEPTH_MM = 3000
const DIMENSION_OFFSET_MM = 300
const UPPER_FLOOR_ELEVATION_MM = 2800
const TRACING_IMAGE = { scope: 'project', contentHash: 'tracec0de' } as const
const TRACING_SIZE_PX = 800

/** An underlay with a fixed id, so two derivations of the same project agree on it. */
export function createTracingUnderlay(id: string): Underlay {
  const underlay = createUnderlay({
    image: TRACING_IMAGE,
    width: TRACING_SIZE_PX,
    height: TRACING_SIZE_PX,
  })
  return { ...underlay, id }
}

/** A dimension along the south wall, or along the north wall when `alongNorthWall` is true. */
export function createRoomDimension(id: string, alongNorthWall = false): Dimension {
  const y = alongNorthWall ? ROOM_DEPTH_MM : 0
  return createDimension({
    start: { x: 0, y },
    end: { x: ROOM_WIDTH_MM, y },
    offset: DIMENSION_OFFSET_MM,
    id,
  })
}

function closedWallLoop(): Floor['walls'] {
  const southWest = { x: 0, y: 0 }
  const southEast = { x: ROOM_WIDTH_MM, y: 0 }
  const northEast = { x: ROOM_WIDTH_MM, y: ROOM_DEPTH_MM }
  const northWest = { x: 0, y: ROOM_DEPTH_MM }
  return [
    createWall(southWest, southEast, { id: 'w-south' }),
    createWall(southEast, northEast, { id: 'w-east' }),
    createWall(northEast, northWest, { id: 'w-north' }),
    createWall(northWest, southWest, { id: 'w-west' }),
  ]
}

/**
 * A ground floor with a closed wall loop (so one room is derived), a door, a sofa, an underlay
 * (`u1`), and a dimension (`d1`). Room overrides live on the project, not the floor, so
 * `twoStoreyProject` adds them.
 */
export function furnishedGroundFloor(): Floor {
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
  return {
    ...createFloor('Ground', { id: 'g', walls: closedWallLoop() }),
    openings: [door],
    furniture: [sofa],
    underlays: [createTracingUnderlay('u1')],
    dimensions: [createRoomDimension('d1')],
  }
}

/** The key of the room override of a project built by `twoStoreyProject`. */
export function parlorRoomKey(project: Project): string {
  const [roomKey] = Object.keys(project.roomOverrides!)
  return roomKey!
}

/**
 * Two floors joined by a stair, with the furnished ground floor and an override that names the
 * ground room `PARLOR_NAME` and gives it `PARLOR_CEILING_HEIGHT_MM`.
 */
export function twoStoreyProject(): Project {
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.1.0',
  })
  project.floors = [
    furnishedGroundFloor(),
    createFloor('Upper', { id: 'u', elevation: UPPER_FLOOR_ELEVATION_MM }),
  ]
  project.stairs = [createStair({ id: 's1', connection: { fromFloorId: 'g', toFloorId: 'u' } })]
  const [room] = deriveSceneGraph(project).rooms
  const roomKey = room!.id.slice(ROOM_ID_PREFIX.length)
  project.roomOverrides = {
    [roomKey]: { name: PARLOR_NAME, ceilingHeight: PARLOR_CEILING_HEIGHT_MM },
  }
  return project
}

/** The project with its ground floor (the first one) replaced by `change(ground)`. */
export function withGround(project: Project, change: (ground: Floor) => Floor): Project {
  const [ground, ...upperFloors] = project.floors
  return { ...project, floors: [change(ground!), ...upperFloors] }
}

/** The project with the parlor override replaced by a new object holding `change` on top. */
export function withParlorOverride(
  project: Project,
  change: Partial<{ name: string; ceilingHeight: number }>,
): Project {
  const roomKey = parlorRoomKey(project)
  return {
    ...project,
    roomOverrides: { [roomKey]: { ...project.roomOverrides![roomKey]!, ...change } },
  }
}
