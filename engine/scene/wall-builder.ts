import * as THREE from 'three'

import {
  WALL_NODE_PREFIX,
  distance,
  dot,
  junctionFills,
  openingVoidContour,
  planToWorld,
  resolveOpeningEdge,
  subtract,
  wallFootprints,
  wallHeight,
  type Contour,
  type GraphEdge,
  type JunctionFill,
  type OpeningSceneNode,
  type PlanarGraph,
  type Point,
  type WallFootprint,
  type WallSceneNode,
} from '../../core'
import type { MaterialProvider } from '../materials/material-provider'

import {
  geometryFromSections,
  reverseTriangleWinding,
  thicknessSpanningQuad,
  type Triangle,
  type WallSection,
} from './geometry-utils'
import { buildJunctionFill } from './junction-fill-builder'
import { buildWallPrism, wallFaceRef } from './wall-prism'

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
 * yields one mesh per edge, all carrying the wall node's entity id. An edge with
 * no openings takes the solid prism path; an edge that hosts one or more openings
 * takes the profile path, cutting each opening's void out of the long faces.
 */
export function buildWalls(input: WallBuildInput): THREE.Group {
  const group = new THREE.Group()
  const wallsByModelId = indexWallsByModelId(input.walls)
  const thicknessByEdge = input.graph.edges.map(
    (edge) => wallsByModelId.get(edge.wallId)?.thickness ?? 0,
  )
  const footprints = wallFootprints(input.graph, thicknessByEdge)
  input.graph.edges.forEach((edge, index) => {
    const node = edgeWallNode(edge, input.graph.vertices, wallsByModelId)
    if (node === null) return
    const openings = openingsOnEdge(edge, input)
    const footprint = footprints[index] as WallFootprint
    if (openings.length === 0) {
      group.add(buildWallPrism(node, footprint, input.materials))
    } else {
      group.add(buildOpeningWallMesh({ edge, wall: node, openings, footprint }, input))
    }
  })
  for (const mesh of buildJunctionFills(input, thicknessByEdge, wallsByModelId)) {
    group.add(mesh)
  }
  return group
}

/**
 * One junction-fill mesh per junction where three or more walls meet, each rising
 * to the tallest wall incident to that junction. A fill whose incident walls all
 * resolve to no wall node is skipped (no height to rise to).
 */
function buildJunctionFills(
  input: WallBuildInput,
  thicknessByEdge: number[],
  wallsByModelId: Map<string, WallSceneNode>,
): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = []
  for (const fill of junctionFills(input.graph, thicknessByEdge)) {
    const height = fillHeight(fill, input.graph, wallsByModelId)
    if (height === null) continue
    meshes.push(buildJunctionFill(fill, height, input.materials))
  }
  return meshes
}

/**
 * The height a junction fill rises to: the maximum height over the walls incident
 * to the junction. Returns null when no incident edge resolves to a wall node.
 */
function fillHeight(
  fill: JunctionFill,
  graph: PlanarGraph,
  wallsByModelId: Map<string, WallSceneNode>,
): number | null {
  const heights = fill.edgeIndexes
    .map((edgeIndex) => wallsByModelId.get(graph.edges[edgeIndex]?.wallId ?? ''))
    .filter((node): node is WallSceneNode => node !== undefined)
    .map(wallHeight)
  return heights.length === 0 ? null : Math.max(...heights)
}

/** An opening that resolves to a given edge, paired with its distance along it. */
interface EdgeOpening {
  opening: OpeningSceneNode
  positionAlongEdge: number
}

/** The openings whose center resolves to this edge, each with its along position. */
function openingsOnEdge(edge: GraphEdge, input: WallBuildInput): EdgeOpening[] {
  const candidates = input.openingsByWall.get(edge.wallId) ?? []
  const onEdge: EdgeOpening[] = []
  for (const opening of candidates) {
    const resolved = resolveOpeningEdge(opening, input.graph)
    if (resolved?.edge === edge) {
      onEdge.push({ opening, positionAlongEdge: resolved.positionAlongEdge })
    }
  }
  return onEdge
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
 * carrying its host wall's id, thickness, and height, so {@link buildWallPrism}
 * builds the prism from the edge's footprint. Returns null when the host wall node
 * or either endpoint is missing (guarding `noUncheckedIndexedAccess`).
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

/** Half the centerline thickness lands the face on either wall surface. */
const SIDE_INTERIOR = 1
const SIDE_EXTERIOR = -1

/**
 * The edge-local frame the profile path works in: distance along the edge (`u`,
 * from vertex `a`) by height (`v`). `along` and `normal` are the unit axes, and
 * `normal` is the left-hand normal of `along` (matching `core/topology/openings`).
 * `footprint` is the edge's mitered ground plan, so the outer boundary follows the
 * miter rather than squaring its ends.
 */
interface EdgeFrame {
  a: Point
  along: Point
  normal: Point
  length: number
  height: number
  thickness: number
  footprint: WallFootprint
}

/** Derives the edge-local frame for an edge segment's wall node and footprint. */
function edgeFrame(a: Point, b: Point, target: OpeningWall): EdgeFrame {
  const length = distance(a, b)
  const along: Point = { x: (b.x - a.x) / length, y: (b.y - a.y) / length }
  return {
    a,
    along,
    normal: { x: -along.y, y: along.x },
    length,
    height: wallHeight(target.wall),
    thickness: target.wall.thickness,
    footprint: target.footprint,
  }
}

/**
 * The along distance for an outline point, remapping only the outer-boundary end
 * columns to the mitered footprint. A point at `u = 0` takes the `a`-end miter for
 * its side (interior/`+normal` -> `aPlus`, exterior/`-normal` -> `aMinus`); a point
 * at `u = length` takes the `b`-end miter; interior void corners keep their `u`. The
 * mitered corner sits on the same face line, so only its along distance shifts.
 */
function mappedAlong(frame: EdgeFrame, u: number, side: number): number {
  if (u !== 0 && u !== frame.length) return u
  const corner = frame.footprint[`${u === 0 ? 'a' : 'b'}${side > 0 ? 'Plus' : 'Minus'}`]
  return dot(subtract(corner, frame.a), frame.along)
}

/**
 * Maps an edge-local `(u, v)` point onto one wall face: `side` is `+1` for the
 * `+normal` face and `-1` for the `-normal` face, each half the thickness off the
 * centerline. The outer-boundary end columns follow the mitered footprint via
 * {@link mappedAlong}. Every vertex routes through `planToWorld`, sharing the axis map.
 */
function edgeLocalToWorld(frame: EdgeFrame, uv: THREE.Vector2, side: number): THREE.Vector3 {
  const halfThickness = (side * frame.thickness) / 2
  const u = mappedAlong(frame, uv.x, side)
  const plan: Point = {
    x: frame.a.x + frame.along.x * u + frame.normal.x * halfThickness,
    y: frame.a.y + frame.along.y * u + frame.normal.y * halfThickness,
  }
  const world = planToWorld(plan, uv.y)
  return new THREE.Vector3(world.x, world.y, world.z)
}

/**
 * The void hole loop in the edge-local `(u, v)` frame: the contour's corner
 * points (start plus each segment's `to`, dropping the final closing duplicate),
 * with the contour-local `x` shifted to the opening's distance along the edge.
 */
function voidHoleLoop(contour: Contour, positionAlongEdge: number): THREE.Vector2[] {
  const corners = [contour.start, ...contour.segments.slice(0, -1).map((segment) => segment.to)]
  return corners.map((point) => new THREE.Vector2(positionAlongEdge + point.x, point.y))
}

/** The outer elevation rectangle `[0, length] x [0, height]` in edge-local space. */
function outlineRectangle(frame: EdgeFrame): THREE.Vector2[] {
  return [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(frame.length, 0),
    new THREE.Vector2(frame.length, frame.height),
    new THREE.Vector2(0, frame.height),
  ]
}

/**
 * A triangulated elevation outline: the concatenated point list (outline followed
 * by each hole loop) and the triangle index triples into it. `holeLoops` keeps the
 * void corner loops so the reveal builder lines the cut without recomputing them.
 */
interface TriangulatedOutline {
  points: THREE.Vector2[]
  triangles: Triangle[]
  holeLoops: THREE.Vector2[][]
}

/**
 * World positions for one long face: the triangulated outline-minus-voids placed
 * on `side`. Triangles index into the outline's point list (outline followed by
 * each hole loop).
 */
function longFacePositions(frame: EdgeFrame, outline: TriangulatedOutline, side: number): number[] {
  const positions: number[] = []
  for (const triangle of outline.triangles) {
    for (const index of triangle) {
      const world = edgeLocalToWorld(frame, outline.points[index] as THREE.Vector2, side)
      positions.push(world.x, world.y, world.z)
    }
  }
  return positions
}

/**
 * World positions for one outer cap quad bridging the interior and exterior faces
 * along the outline edge `from -> to`, wound to face outward.
 */
function outerCapPositions(frame: EdgeFrame, from: THREE.Vector2, to: THREE.Vector2): number[] {
  return thicknessSpanningQuad([
    edgeLocalToWorld(frame, from, SIDE_INTERIOR),
    edgeLocalToWorld(frame, to, SIDE_INTERIOR),
    edgeLocalToWorld(frame, to, SIDE_EXTERIOR),
    edgeLocalToWorld(frame, from, SIDE_EXTERIOR),
  ])
}

/** Tolerance for snapping a void edge onto the wall's outer outline boundary. */
const BOUNDARY_EPSILON = 1e-6

/** Whether both `(u, v)` values sit within `BOUNDARY_EPSILON` of `target`. */
function bothNear(first: number, second: number, target: number): boolean {
  return Math.abs(first - target) < BOUNDARY_EPSILON && Math.abs(second - target) < BOUNDARY_EPSILON
}

/**
 * Whether the void edge `from -> to` lies on the wall's outer outline boundary:
 * the base (`v = 0`), the top (`v = height`), or either end (`u = 0`, `u = length`).
 * Such an edge is the cut meeting an outline edge, not a face to line.
 */
function isOuterBoundaryEdge(from: THREE.Vector2, to: THREE.Vector2, frame: EdgeFrame): boolean {
  return (
    bothNear(from.y, to.y, 0) ||
    bothNear(from.y, to.y, frame.height) ||
    bothNear(from.x, to.x, 0) ||
    bothNear(from.x, to.x, frame.length)
  )
}

/**
 * World positions for one reveal quad (two triangles) bridging the interior and
 * exterior faces along the void edge `from -> to`, wound so its normal points
 * inward toward the void interior (away from the wall material).
 */
function revealQuad(frame: EdgeFrame, from: THREE.Vector2, to: THREE.Vector2): number[] {
  // The `to -> from` corner order (vs the outer cap's `from -> to`) reverses the
  // winding so the reveal normal points inward toward the void.
  return thicknessSpanningQuad([
    edgeLocalToWorld(frame, to, SIDE_INTERIOR),
    edgeLocalToWorld(frame, from, SIDE_INTERIOR),
    edgeLocalToWorld(frame, from, SIDE_EXTERIOR),
    edgeLocalToWorld(frame, to, SIDE_EXTERIOR),
  ])
}

/**
 * World positions for the reveal faces lining every void: a quad spanning the wall
 * thickness along each void-boundary edge that does not lie on the wall's outer
 * outline (a door's floor edge sits on `v = 0`, so it is skipped). The closing edge
 * from the last corner back to the first lines the loop's final side.
 */
function revealPositions(frame: EdgeFrame, holeLoops: THREE.Vector2[][]): number[] {
  const positions: number[] = []
  for (const loop of holeLoops) {
    for (let index = 0; index < loop.length; index += 1) {
      const from = loop[index] as THREE.Vector2
      const to = loop[(index + 1) % loop.length] as THREE.Vector2
      if (isOuterBoundaryEdge(from, to, frame)) continue
      positions.push(...revealQuad(frame, from, to))
    }
  }
  return positions
}

/** The profile path's contiguous sections, in a fixed geometry order. The two long
 *  faces carry the wall's paint refs (interior side 'left', exterior side 'right'),
 *  matching the prism path; the caps and reveal carry no ref. */
function openingWallSections(
  frame: EdgeFrame,
  outline: TriangulatedOutline,
  wallId: string,
): WallSection[] {
  const top = new THREE.Vector2(0, frame.height)
  const topEnd = new THREE.Vector2(frame.length, frame.height)
  const baseEnd = new THREE.Vector2(frame.length, 0)
  const base = new THREE.Vector2(0, 0)
  const reversed: TriangulatedOutline = {
    points: outline.points,
    triangles: reverseTriangleWinding(outline.triangles),
    holeLoops: outline.holeLoops,
  }
  const sections: WallSection[] = [
    {
      role: 'interiorFace',
      positions: longFacePositions(frame, outline, SIDE_INTERIOR),
      ref: wallFaceRef(wallId, 'left'),
    },
    {
      role: 'exteriorFace',
      positions: longFacePositions(frame, reversed, SIDE_EXTERIOR),
      ref: wallFaceRef(wallId, 'right'),
    },
    { role: 'top', positions: outerCapPositions(frame, topEnd, top) },
    { role: 'base', positions: outerCapPositions(frame, base, baseEnd) },
    // The two vertical end caps (u = 0 and u = length) share the exterior-face
    // material but are a section of their own, separate from the exterior long
    // face above, so both end caps draw in one group.
    {
      role: 'exteriorFace',
      positions: [
        ...outerCapPositions(frame, top, base),
        ...outerCapPositions(frame, baseEnd, topEnd),
      ],
    },
  ]
  // Reveal faces line the cut. A degenerate outline with no lined edges adds no
  // section, so the mesh carries no empty reveal material group.
  const reveal = revealPositions(frame, outline.holeLoops)
  if (reveal.length > 0) sections.push({ role: 'reveal', positions: reveal })
  return sections
}

/** An edge paired with its host wall node, the openings cut into it, and its footprint. */
interface OpeningWall {
  edge: GraphEdge
  wall: WallSceneNode
  openings: EdgeOpening[]
  footprint: WallFootprint
}

/** Triangulates the wall's elevation outline with each opening's void cut as a hole. */
function triangulatedWallOutline(frame: EdgeFrame, openings: EdgeOpening[]): TriangulatedOutline {
  const outline = outlineRectangle(frame)
  const holeLoops = openings.map((entry) =>
    voidHoleLoop(openingVoidContour(entry.opening), entry.positionAlongEdge),
  )
  return {
    points: [...outline, ...holeLoops.flat()],
    triangles: THREE.ShapeUtils.triangulateShape(outline, holeLoops) as Triangle[],
    holeLoops,
  }
}

/**
 * Builds the mesh for an edge that hosts openings: the wall's elevation outline
 * with each opening's void (from {@link openingVoidContour}) cut from it as a
 * hole, triangulated through `THREE.ShapeUtils` into two long faces at plus and
 * minus half the thickness, closed by the outer top, base, and end caps and lined
 * with reveal faces along the cut. Carries the wall node's entity id.
 */
function buildOpeningWallMesh(target: OpeningWall, input: WallBuildInput): THREE.Mesh {
  // buildWalls reaches this only after edgeWallNode validated both endpoints for
  // the same edge, so the vertices are present.
  const a = input.graph.vertices[target.edge.a] as Point
  const b = input.graph.vertices[target.edge.b] as Point
  const frame = edgeFrame(a, b, target)
  const outline = triangulatedWallOutline(frame, target.openings)
  const wallId = target.wall.id.slice(WALL_NODE_PREFIX.length)
  const sections = openingWallSections(frame, outline, wallId)
  const geometry = geometryFromSections(sections)
  const materials = sections.map((section) => input.materials.material(section.role, section.ref))
  const mesh = new THREE.Mesh(geometry, materials)
  mesh.userData.entityId = target.wall.id
  return mesh
}
