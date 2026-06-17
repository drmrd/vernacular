import { dimensionLength } from '../geometry/dimension'
import { furnitureFootprintCorners } from '../model/furniture-footprint'
import type {
  Dimension,
  Floor,
  FurnitureInstance,
  Opening,
  OpeningOrientation,
  Point,
  Project,
  RoomOverride,
  StairRunType,
  Underlay,
  UnderlayPlacement,
  UnderlaySource,
  Wall,
} from '../model/types'
import { deriveOpeningGeometry } from '../topology/openings'
import { applyRoomOverrides, deriveRooms } from '../topology/rooms'

// Kind-prefixed ids keep node ids globally unique within the scene graph.
export const FLOOR_NODE_PREFIX = 'floor:'
export const WALL_NODE_PREFIX = 'wall:'
export const UNDERLAY_NODE_PREFIX = 'underlay:'
export const OPENING_NODE_PREFIX = 'opening:'
export const DIMENSION_NODE_PREFIX = 'dimension:'
export const STAIR_NODE_PREFIX = 'stair:'
export const FURNITURE_NODE_PREFIX = 'furniture:'

export interface SceneNode {
  id: string
  kind: 'floor'
  name: string
  elevation: number
}

export interface WallSceneNode {
  id: string
  kind: 'wall'
  floorId: string
  start: Point
  end: Point
  thickness: number
  /**
   * Per-wall height in floor-plan units. Nodes from `deriveWallNode` always
   * carry it, sourced from the host floor's `defaultCeilingHeight`. It is
   * optional because hand-built `WallSceneNode` literals (chiefly the 2D
   * editor's fixtures) omit it; `wallHeight` supplies the
   * `DEFAULT_CEILING_HEIGHT_MM` fallback for those literal-built nodes.
   */
  height?: number
}

export interface RoomSceneNode {
  id: string
  kind: 'room'
  floorId: string
  polygon: Point[]
  /** The thickness-aware clear-area polygon from the derived room. */
  clearPolygon: Point[]
  /**
   * The boundary at the bounding walls' outer faces (the gross-area boundary):
   * the mirror of `clearPolygon`, sourced from the derived room's
   * `outerPolygon`. It is optional because hand-built `RoomSceneNode` literals
   * (chiefly fixtures) omit it; the floor-slab builder supplies a
   * `clearPolygon` fallback for those literal-built nodes.
   */
  outerPolygon?: Point[]
  area: number
  name?: string
  /** Interior void rings in floor-plan space, mirroring the derived room's holes. */
  holes?: Point[][]
  /**
   * Ceiling height in floor-plan units. Nodes from `deriveRoomNodesForFloor`
   * always carry it, sourced from the host floor's `defaultCeilingHeight`. It is
   * optional because hand-built `RoomSceneNode` literals (chiefly fixtures) omit
   * it; `ceilingHeight` supplies the `DEFAULT_CEILING_HEIGHT_MM` fallback for
   * those literal-built nodes.
   */
  ceilingHeight?: number
}

export interface UnderlaySceneNode {
  id: string
  kind: 'underlay'
  floorId: string
  source: UnderlaySource
  width: number
  height: number
  placement: UnderlayPlacement
  opacity: number
  visible: boolean
}

export interface OpeningSceneNode {
  id: string
  kind: 'opening'
  floorId: string
  /** ElementType id, category 'opening'. */
  type: string
  center: Point
  along: Point
  normal: Point
  width: number
  height: number
  sillHeight: number
  hostThickness: number
  orientation: OpeningOrientation
  /**
   * Id of the wall this opening cuts. Nodes from `deriveOpeningNode` always
   * carry it, sourced from the opening's host wall. It is optional because
   * hand-built `OpeningSceneNode` literals (chiefly fixtures) omit it; the
   * opening-to-edge resolver treats its absence as an opening it cannot place.
   */
  hostWallId?: string
}

export interface DimensionSceneNode {
  id: string
  kind: 'dimension'
  floorId: string
  start: Point
  end: Point
  offset: number
  length: number
}

export interface StairSceneNode {
  id: string
  kind: 'stair'
  floorId: string
  runType: StairRunType
  position: Point
  width: number
  length: number
  rotation: number
  wellFloorId: string
}

export interface FurnitureSceneNode {
  id: string
  kind: 'furniture'
  floorId: string
  /** Plan-space mm corners from furnitureFootprintCorners(position, rotation, footprint). */
  footprintCorners: [Point, Point, Point, Point]
  /** Box base, mm above the floor. */
  elevationZ: number
  /** Box rises to elevationZ + height, mm. */
  height: number
}

export interface SceneGraph {
  nodes: SceneNode[]
  walls: WallSceneNode[]
  rooms: RoomSceneNode[]
  underlays: UnderlaySceneNode[]
  openings: OpeningSceneNode[]
  dimensions: DimensionSceneNode[]
  stairs: StairSceneNode[]
  furniture: FurnitureSceneNode[]
}

export function deriveFloorNode(floor: Floor): SceneNode {
  return {
    id: `${FLOOR_NODE_PREFIX}${floor.id}`,
    kind: 'floor',
    name: floor.name,
    elevation: floor.elevation,
  }
}

export function deriveWallNode(floor: Floor, wall: Wall): WallSceneNode {
  return {
    id: `${WALL_NODE_PREFIX}${wall.id}`,
    kind: 'wall',
    floorId: floor.id,
    start: wall.start,
    end: wall.end,
    thickness: wall.thickness,
    height: floor.defaultCeilingHeight,
  }
}

export function deriveUnderlayNode(floor: Floor, underlay: Underlay): UnderlaySceneNode {
  return {
    id: `${UNDERLAY_NODE_PREFIX}${underlay.id}`,
    kind: 'underlay',
    floorId: floor.id,
    source: underlay.source,
    width: underlay.width,
    height: underlay.height,
    placement: underlay.placement,
    opacity: underlay.opacity,
    visible: underlay.visible,
  }
}

export function deriveUnderlayNodesForFloor(floor: Floor): UnderlaySceneNode[] {
  return floor.underlays.map((underlay) => deriveUnderlayNode(floor, underlay))
}

export function deriveOpeningNode(
  floor: Floor,
  opening: Opening,
  hostWall: Wall,
): OpeningSceneNode {
  const geometry = deriveOpeningGeometry(opening, hostWall)
  return {
    id: `${OPENING_NODE_PREFIX}${opening.id}`,
    kind: 'opening',
    floorId: floor.id,
    hostWallId: hostWall.id,
    type: opening.type,
    center: geometry.center,
    along: geometry.along,
    normal: geometry.normal,
    width: geometry.width,
    height: opening.height,
    sillHeight: opening.sillHeight,
    hostThickness: hostWall.thickness,
    orientation: opening.orientation,
  }
}

export function deriveOpeningNodesForFloor(floor: Floor): OpeningSceneNode[] {
  return floor.openings.flatMap((opening) => {
    const hostWall = floor.walls.find((wall) => wall.id === opening.hostWallId)
    return hostWall ? [deriveOpeningNode(floor, opening, hostWall)] : []
  })
}

export function deriveDimensionNode(floor: Floor, dimension: Dimension): DimensionSceneNode {
  return {
    id: `${DIMENSION_NODE_PREFIX}${dimension.id}`,
    kind: 'dimension',
    floorId: floor.id,
    start: dimension.start,
    end: dimension.end,
    offset: dimension.offset,
    length: dimensionLength(dimension),
  }
}

export function deriveDimensionNodesForFloor(floor: Floor): DimensionSceneNode[] {
  return floor.dimensions.map((dimension) => deriveDimensionNode(floor, dimension))
}

export function deriveFurnitureNode(floor: Floor, item: FurnitureInstance): FurnitureSceneNode {
  return {
    id: `${FURNITURE_NODE_PREFIX}${item.id}`,
    kind: 'furniture',
    floorId: floor.id,
    footprintCorners: furnitureFootprintCorners(item.position, item.rotation, item.footprint),
    elevationZ: item.elevationZ,
    height: item.height,
  }
}

export function deriveFurnitureNodesForFloor(floor: Floor): FurnitureSceneNode[] {
  return floor.furniture.map((item) => deriveFurnitureNode(floor, item))
}

export function deriveRoomNodesForFloor(
  floor: Floor,
  overrides?: Readonly<Record<string, RoomOverride>>,
): RoomSceneNode[] {
  return applyRoomOverrides(deriveRooms(floor.walls), overrides).map((room) => ({
    // room.id already carries the `room:` namespace prefix from the topology
    // layer (see core/topology/rooms.ts), so it is used directly here rather
    // than re-prefixed, unlike the locally namespaced floor and wall node ids.
    id: room.id,
    kind: 'room',
    floorId: floor.id,
    polygon: room.polygon,
    clearPolygon: room.clearPolygon,
    outerPolygon: room.outerPolygon,
    area: room.area,
    ceilingHeight: room.ceilingHeight ?? floor.defaultCeilingHeight,
    // Omit the optional name when absent so the no-overrides projection stays
    // identical to slice 1 under exactOptionalPropertyTypes.
    ...(room.name !== undefined && { name: room.name }),
    // Omit holes for a plain room so its projection stays identical under
    // exactOptionalPropertyTypes; only a donut or courtyard room carries them.
    ...(room.holes !== undefined && { holes: room.holes }),
  }))
}

export function deriveStairNodes(project: Project): StairSceneNode[] {
  return project.stairs.map((stair) => ({
    id: `${STAIR_NODE_PREFIX}${stair.id}`,
    kind: 'stair',
    floorId: stair.connection.fromFloorId,
    runType: stair.runType,
    position: stair.position,
    width: stair.width,
    length: stair.length,
    rotation: stair.rotation,
    wellFloorId: stair.connection.toFloorId,
  }))
}

/** Pure projection of the project model into a normalized scene graph. */
export function deriveSceneGraph(project: Project): SceneGraph {
  return {
    nodes: project.floors.map(deriveFloorNode),
    walls: project.floors.flatMap((floor) =>
      floor.walls.map((wall) => deriveWallNode(floor, wall)),
    ),
    rooms: project.floors.flatMap((floor) => deriveRoomNodesForFloor(floor, project.roomOverrides)),
    underlays: project.floors.flatMap(deriveUnderlayNodesForFloor),
    openings: project.floors.flatMap(deriveOpeningNodesForFloor),
    dimensions: project.floors.flatMap(deriveDimensionNodesForFloor),
    stairs: deriveStairNodes(project),
    furniture: project.floors.flatMap(deriveFurnitureNodesForFloor),
  }
}
