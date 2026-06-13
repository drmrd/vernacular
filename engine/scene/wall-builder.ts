import * as THREE from 'three'

import {
  WALL_NODE_PREFIX,
  wallHeight,
  type GraphEdge,
  type OpeningSceneNode,
  type PlanarGraph,
  type WallSceneNode,
} from '../../core'
import type { MaterialProvider, SurfaceRole } from '../materials/material-provider'

/**
 * The shell role for each of a BoxGeometry's six material groups, in its fixed
 * face order: index 0 = +X, 1 = -X, 2 = +Y, 3 = -Y, 4 = +Z, 5 = -Z. After the
 * wall builder's world-Y rotation, +Y is the upward face, -Y the downward face,
 * +Z and -Z are the two long faces along the wall, and +X / -X are the end caps.
 * A single wall has no room context to distinguish its two long faces, so the
 * interior/exterior split is a consistent convention; every role renders the
 * same in this slice.
 */
const FACE_ROLES: SurfaceRole[] = [
  'exteriorFace', // +X end cap
  'exteriorFace', // -X end cap
  'top', // +Y upward face
  'base', // -Y downward face
  'interiorFace', // +Z long face
  'exteriorFace', // -Z long face
]

/**
 * Builds the solid box mesh for one wall, in the pinned world-space convention
 * (ADR-0045): plan x maps to world X, plan y maps to world Z, and the vertical
 * axis is world Y. The box spans the wall's length along its direction, rises
 * from world Y = 0 to its height, and is centered across the centerline by half
 * its thickness. A per-face material array keyed by surface role covers the
 * shell: BoxGeometry emits one material group per face in the fixed order
 * +X, -X, +Y, -Y, +Z, -Z (see FACE_ROLES), so the array indexes line up with
 * each face's drawn role.
 */
export function buildWallMesh(node: WallSceneNode, materials: MaterialProvider): THREE.Mesh {
  const length = Math.hypot(node.end.x - node.start.x, node.end.y - node.start.y)
  const height = wallHeight(node)
  const geometry = new THREE.BoxGeometry(length, height, node.thickness)
  const material = FACE_ROLES.map((role) => materials.material(role))
  const mesh = new THREE.Mesh(geometry, material)
  const midX = (node.start.x + node.end.x) / 2
  const midPlanY = (node.start.y + node.end.y) / 2
  // BoxGeometry centers its height at the origin, so raise the mesh by half its
  // height to land the base on the floor datum (Y = 0).
  mesh.position.set(midX, height / 2, midPlanY)
  // Negate the plan-y delta: plan y is down-positive, while it maps to the
  // right-handed world Z, so the wall's heading flips sense in world space.
  mesh.rotation.y = Math.atan2(-(node.end.y - node.start.y), node.end.x - node.start.x)
  mesh.userData.entityId = node.id
  return mesh
}

/** Inputs for building a floor's walls from its planar graph. */
export interface WallBuildInput {
  graph: PlanarGraph
  walls: WallSceneNode[]
  openingsByWall: Map<string, OpeningSceneNode[]>
  materials: MaterialProvider
}

/**
 * Builds the wall meshes for one floor from its planar graph. Each graph edge is
 * a wall segment: a split wall (one {@link WallSceneNode} spanning several edges)
 * yields one box mesh per edge, all carrying the wall node's entity id. Openings
 * are ignored in this slice; the void-cut path lands in a later cycle.
 */
export function buildWalls(input: WallBuildInput): THREE.Group {
  const group = new THREE.Group()
  const wallsByModelId = indexWallsByModelId(input.walls)
  for (const edge of input.graph.edges) {
    const node = edgeWallNode(edge, input.graph.vertices, wallsByModelId)
    if (node !== null) group.add(buildWallMesh(node, input.materials))
  }
  return group
}

/** Indexes wall nodes by their stripped model id (the graph edges' `wallId`). */
function indexWallsByModelId(walls: WallSceneNode[]): Map<string, WallSceneNode> {
  const byModelId = new Map<string, WallSceneNode>()
  for (const wall of walls) {
    byModelId.set(wall.id.slice(WALL_NODE_PREFIX.length), wall)
  }
  return byModelId
}

/**
 * Synthesizes the {@link WallSceneNode} for one graph edge: the edge's segment
 * carrying its host wall's id, thickness, and height, so {@link buildWallMesh}
 * builds the box. Returns null when the host wall node or either endpoint is
 * missing (guarding `noUncheckedIndexedAccess`).
 */
function edgeWallNode(
  edge: GraphEdge,
  vertices: PlanarGraph['vertices'],
  wallsByModelId: Map<string, WallSceneNode>,
): WallSceneNode | null {
  const wall = wallsByModelId.get(edge.wallId)
  const a = vertices[edge.a]
  const b = vertices[edge.b]
  if (wall === undefined || a === undefined || b === undefined) return null
  return {
    id: wall.id,
    kind: 'wall',
    floorId: wall.floorId,
    start: a,
    end: b,
    thickness: wall.thickness,
    ...(wall.height !== undefined ? { height: wall.height } : {}),
  }
}
