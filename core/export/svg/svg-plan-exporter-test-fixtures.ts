import {
  createDimension,
  createEmptyProject,
  createFloor,
  createOpening,
  createWall,
} from '../../model/factories'
import type { Floor, Point, Project, Wall } from '../../model/types'
import {
  deriveSceneGraph,
  type DimensionSceneNode,
  type OpeningSceneNode,
  type RoomSceneNode,
} from '../../scene/scene-graph'
import { roomKey } from '../../topology/rooms'

// The one wall length, room depth, and dimension offset every exporter fixture
// shares. Held as named constants so the fixture geometry reads as intent rather
// than scattered coordinates.
const WALL_LENGTH_MM = 4000
const ROOM_DEPTH_MM = 3000
const OPENING_CENTER_MM = WALL_LENGTH_MM / 2
const DIMENSION_OFFSET_MM = 300

/**
 * Wrap a single floor in a deterministic project envelope. The meta is fixed so
 * two independent builds are byte-identical and deep-equal, which the exporter's
 * determinism and no-mutation tests rely on.
 */
function projectWithFloor(floor: Project['floors'][number]): Project {
  return {
    ...createEmptyProject({
      name: 'House',
      units: 'metric',
      period: 'victorian',
      appVersion: '0.1.0',
    }),
    floors: [floor],
  }
}

/**
 * Build a deterministic project with one floor and a single horizontal wall.
 */
export function createSingleWallProject(): Project {
  const wall = createWall({ x: 0, y: 0 }, { x: WALL_LENGTH_MM, y: 0 }, { id: 'wall-a' })
  return projectWithFloor(createFloor('Ground Floor', { id: 'floor-a', walls: [wall] }))
}

/**
 * Build a deterministic project with one floor and a single horizontal wall that
 * carries a construction profile whose assembly total (231 mm, solid masonry
 * brick) differs from the wall's raw thickness (114 mm, the factory default).
 */
export function createConstructionProfiledWallProject(): Project {
  const wall = {
    ...createWall({ x: 0, y: 0 }, { x: WALL_LENGTH_MM, y: 0 }, { id: 'wall-a' }),
    constructionProfile: 'solid-masonry-brick',
  }
  return projectWithFloor(createFloor('Ground Floor', { id: 'floor-a', walls: [wall] }))
}

/** Build a deterministic project with one floor and two walls forming a corner. */
export function createTwoWallProject(): Project {
  const walls = [
    createWall({ x: 0, y: 0 }, { x: WALL_LENGTH_MM, y: 0 }, { id: 'wall-a' }),
    createWall(
      { x: WALL_LENGTH_MM, y: 0 },
      { x: WALL_LENGTH_MM, y: ROOM_DEPTH_MM },
      { id: 'wall-b' },
    ),
  ]
  return projectWithFloor(createFloor('Ground Floor', { id: 'floor-a', walls }))
}

/**
 * Build a deterministic project whose single floor encloses one rectangular room
 * with a closed four-wall loop. The endpoints connect end-to-end
 * ((0,0)->(4000,0)->(4000,3000)->(0,3000)->(0,0)) so `deriveSceneGraph` walks the
 * loop into exactly one derived room. Pass overrides to attach a name.
 */
export function createSingleRoomProject(roomOverrides?: Project['roomOverrides']): Project {
  const floor = createFloor('Ground Floor', { id: 'floor-a', walls: roomLoopWalls() })
  const project = projectWithFloor(floor)
  return roomOverrides === undefined ? project : { ...project, roomOverrides }
}

/** The closed four-wall loop, start to end, that encloses the one fixture room. */
function roomLoopWalls(): Wall[] {
  return [
    createWall({ x: 0, y: 0 }, { x: WALL_LENGTH_MM, y: 0 }, { id: 'wall-a' }),
    createWall(
      { x: WALL_LENGTH_MM, y: 0 },
      { x: WALL_LENGTH_MM, y: ROOM_DEPTH_MM },
      { id: 'wall-b' },
    ),
    createWall(
      { x: WALL_LENGTH_MM, y: ROOM_DEPTH_MM },
      { x: 0, y: ROOM_DEPTH_MM },
      { id: 'wall-c' },
    ),
    createWall({ x: 0, y: ROOM_DEPTH_MM }, { x: 0, y: 0 }, { id: 'wall-d' }),
  ]
}

/**
 * Build a deterministic project whose single floor encloses the same rectangular
 * room as `createSingleRoomProject`, with a door centered on `wall-a`. The room fill
 * is drawn beneath the wall and the opening, so this is the fixture that shows
 * whether an opening paints over what the plan already drew under it.
 */
export function createRoomWithOpeningProject(): Project {
  const opening = createOpening({
    type: 'single-swing-door',
    hostWallId: 'wall-a',
    position: OPENING_CENTER_MM,
    id: 'opening-a',
  })
  const floor = createFloor('Ground Floor', { id: 'floor-a', walls: roomLoopWalls() })
  return projectWithFloor({ ...floor, openings: [opening] })
}

/** The first node of a derived collection, asserting the fixture produced exactly one. */
function soleNode<Node>(nodes: readonly Node[], label: string): Node {
  const [node] = nodes
  if (node === undefined) {
    throw new Error(`expected the fixture to derive exactly one ${label}`)
  }
  return node
}

/** The sole derived room scene node for the closed-loop fixture above. */
export function soleDerivedRoom(project: Project): RoomSceneNode {
  return soleNode(deriveSceneGraph(project).rooms, 'room')
}

/**
 * Build a deterministic project with one floor, one horizontal wall, and a single
 * door opening centered on it. `deriveSceneGraph` resolves the opening against its
 * host wall into exactly one `opening:`-prefixed scene node, which the exporter is
 * expected to render. Ids are fixed so two independent builds are byte-identical.
 */
export function createSingleOpeningProject(): Project {
  const wall = createWall({ x: 0, y: 0 }, { x: WALL_LENGTH_MM, y: 0 }, { id: 'wall-a' })
  const opening = createOpening({
    type: 'single-swing-door',
    hostWallId: 'wall-a',
    position: OPENING_CENTER_MM,
    id: 'opening-a',
  })
  const floor = createFloor('Ground Floor', { id: 'floor-a', walls: [wall] })
  return projectWithFloor({ ...floor, openings: [opening] })
}

/** The sole derived opening scene node for the single-opening fixture above. */
export function soleDerivedOpening(project: Project): OpeningSceneNode {
  return soleNode(deriveSceneGraph(project).openings, 'opening')
}

/**
 * Build a deterministic project with one floor and a single horizontal dimension
 * from (0,0) to (4000,0), offset 300 along the left normal. `deriveSceneGraph`
 * resolves it into exactly one `dimension:`-prefixed scene node carrying the
 * measured length, which the exporter is expected to annotate. Ids are fixed so
 * two independent builds are byte-identical.
 */
export function createSingleDimensionProject(): Project {
  const dimension = createDimension({
    start: { x: 0, y: 0 },
    end: { x: WALL_LENGTH_MM, y: 0 },
    offset: DIMENSION_OFFSET_MM,
    id: 'dimension-a',
  })
  const floor = createFloor('Ground Floor', { id: 'floor-a' })
  return projectWithFloor({ ...floor, dimensions: [dimension] })
}

/** The sole derived dimension scene node for the single-dimension fixture above. */
export function soleDerivedDimension(project: Project): DimensionSceneNode {
  return soleNode(deriveSceneGraph(project).dimensions, 'dimension')
}

/** The ids, room names, and distances of the two-floor fixture below. */
export const FIRST_FLOOR_ID = 'floor-first'
export const SECOND_FLOOR_ID = 'floor-second'
export const FIRST_FLOOR_ROOM_NAME = 'Parlor'
export const SECOND_FLOOR_ROOM_NAME = 'Attic'
/** How far the second floor sits from the first, so that it widens a view that counts it. */
export const SECOND_FLOOR_DISTANCE_MM = 50000
/** The first-floor dimension lies this far off its line, outside the room whichever side it takes. */
export const FIRST_FLOOR_DIMENSION_OFFSET_MM = 5000
const FIRST_FLOOR_DIMENSION_LENGTH_MM = WALL_LENGTH_MM
const SECOND_FLOOR_DIMENSION_LENGTH_MM = WALL_LENGTH_MM / 2

const WALL_LETTERS = ['a', 'b', 'c', 'd'] as const

interface RoomFloorSpec {
  id: string
  name: string
  wallPrefix: string
  origin: Point
  dimensionLength: number
  dimensionOffset: number
}

/** The four-wall loop of the fixture room, its walls named `<prefix>-wall-a` to `-d`. */
function prefixedRoomLoop(prefix: string, origin: Point): Wall[] {
  const corner = (dx: number, dy: number): Point => ({ x: origin.x + dx, y: origin.y + dy })
  const corners = [
    corner(0, 0),
    corner(WALL_LENGTH_MM, 0),
    corner(WALL_LENGTH_MM, ROOM_DEPTH_MM),
    corner(0, ROOM_DEPTH_MM),
  ]
  return corners.map((start, index) =>
    createWall(start, corners[(index + 1) % corners.length] ?? start, {
      id: `${prefix}-wall-${WALL_LETTERS[index % WALL_LETTERS.length]}`,
    }),
  )
}

/** One floor with a closed room, a door on its first wall, and one dimension. */
function roomFloor(spec: RoomFloorSpec): Floor {
  const { origin } = spec
  const walls = prefixedRoomLoop(spec.wallPrefix, origin)
  const opening = createOpening({
    type: 'single-swing-door',
    hostWallId: `${spec.wallPrefix}-wall-a`,
    position: OPENING_CENTER_MM,
    id: `${spec.wallPrefix}-door`,
  })
  const dimension = createDimension({
    start: origin,
    end: { x: origin.x + spec.dimensionLength, y: origin.y },
    offset: spec.dimensionOffset,
    id: `${spec.wallPrefix}-dimension`,
  })
  const floor = createFloor(spec.name, { id: spec.id, walls })
  return { ...floor, openings: [opening], dimensions: [dimension] }
}

/** The override key of the room that the four walls of `prefix` enclose. */
function roomKeyOf(prefix: string): string {
  return roomKey({ wallIds: WALL_LETTERS.map((letter) => `${prefix}-wall-${letter}`) })
}

/**
 * Build a deterministic project of two floors. Each floor has one named room, a door
 * in it, and one dimension, so each has room labels and dimensions. The second floor
 * lies far from the first, and the first floor's dimension lies outside its room, so
 * a view that counts either one is wider than the first floor's walls.
 */
export function createTwoFloorProject(): Project {
  const first = roomFloor({
    id: FIRST_FLOOR_ID,
    name: 'Ground Floor',
    wallPrefix: 'first',
    origin: { x: 0, y: 0 },
    dimensionLength: FIRST_FLOOR_DIMENSION_LENGTH_MM,
    dimensionOffset: FIRST_FLOOR_DIMENSION_OFFSET_MM,
  })
  const second = roomFloor({
    id: SECOND_FLOOR_ID,
    name: 'Upper Floor',
    wallPrefix: 'second',
    origin: { x: SECOND_FLOOR_DISTANCE_MM, y: SECOND_FLOOR_DISTANCE_MM },
    dimensionLength: SECOND_FLOOR_DIMENSION_LENGTH_MM,
    dimensionOffset: DIMENSION_OFFSET_MM,
  })
  return {
    ...projectWithFloor(first),
    floors: [first, second],
    roomOverrides: {
      [roomKeyOf('first')]: { name: FIRST_FLOOR_ROOM_NAME },
      [roomKeyOf('second')]: { name: SECOND_FLOOR_ROOM_NAME },
    },
  }
}
