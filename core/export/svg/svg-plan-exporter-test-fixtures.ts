import {
  createDimension,
  createEmptyProject,
  createFloor,
  createOpening,
  createWall,
} from '../../model/factories'
import type { Project } from '../../model/types'
import {
  deriveSceneGraph,
  type DimensionSceneNode,
  type OpeningSceneNode,
  type RoomSceneNode,
} from '../../scene/scene-graph'

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
  const floor = createFloor('Ground Floor', {
    id: 'floor-a',
    walls: [
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
    ],
  })
  const project = projectWithFloor(floor)
  return roomOverrides === undefined ? project : { ...project, roomOverrides }
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

/** Parse an SVG `points="x,y x,y ..."` attribute into an array of points. */
export function parsePoints(attribute: string | null): { x: number; y: number }[] {
  return (attribute ?? '')
    .trim()
    .split(/\s+/u)
    .filter((pair) => pair.length > 0)
    .map((pair) => {
      const [x, y] = pair.split(',').map(Number)
      return { x: x ?? Number.NaN, y: y ?? Number.NaN }
    })
}
