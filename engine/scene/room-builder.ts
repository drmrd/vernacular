import * as THREE from 'three'

import {
  canonicalHoleLoop,
  canonicalOuterLoop,
  ceilingHeight,
  floorSlabThickness,
  leftNormal,
  planToWorld,
  shift,
  type Point,
  type RoomSceneNode,
} from '../../core'
import type { MaterialProvider, SurfaceRole } from '../materials/material-provider'

import { COMPONENTS_PER_VERTEX, reverseTriangleWinding, type Triangle } from './geometry-utils'

/** The finished-floor datum: the slab's top sits at local world Y = 0. */
const FLOOR_DATUM_Y = 0

/**
 * How far each slab side face is pulled inboard of its footprint boundary, in
 * plan millimeters. Two adjacent rooms both reach a shared wall centerline after
 * ADR-0129, so their side faces there are back to back with opposite normals and
 * coplanar; the depth-bias ladder cannot break that tie, because both faces draw
 * the same `exteriorFace` role and so carry the same offset. Pulling every side
 * face this far toward its own interior separates the two so neither wins by a
 * coin flip. The distance is far above the float32 geometric resolution at the
 * maximum plan extent and far below both the wall junction tolerance and any
 * visible threshold, so it removes the coincidence without reading as a gap
 * (ADR-0150).
 */
const SLAB_SIDE_FACE_INSET_MM = 0.1

/**
 * The inward unit normal of a canonical (plan counterclockwise) boundary edge:
 * the interior lies to the left, so `leftNormal` points into the slab. A
 * degenerate zero-length edge has no direction, so it stays put rather than
 * feeding `leftNormal` a divide by zero.
 */
function inwardEdgeNormal(start: Point, end: Point): Point {
  if (start.x === end.x && start.y === end.y) return { x: 0, y: 0 }
  return leftNormal(start, end)
}

/** One contiguous geometry section paired with the surface role it draws. */
interface SlabSection {
  role: SurfaceRole
  positions: number[]
}

/** Pushes a plan boundary point, at the given height, as a world position. */
function pushWorldPoint(positions: number[], point: Point, height: number): void {
  const world = planToWorld(point, height)
  positions.push(world.x, world.y, world.z)
}

/** Positions for one horizontal cap (top or bottom) of the slab prism. */
function slabCapPositions(points: Point[], triangles: Triangle[], height: number): number[] {
  const positions: number[] = []
  for (const triangle of triangles) {
    for (const index of triangle) {
      pushWorldPoint(positions, points[index] as Point, height)
    }
  }
  return positions
}

/**
 * Positions for the vertical sides connecting the top and bottom caps. Each side
 * face is pulled `SLAB_SIDE_FACE_INSET_MM` inboard of its boundary edge, so two
 * adjacent rooms' faces along a shared wall centerline never share a plane. Each
 * edge is offset along its own inward normal with no corner miter, since the
 * corner divergence at a sub-millimeter offset is invisible. The top and base
 * caps still reach the boundary, so the footprint is unchanged.
 */
function slabSidePositions(boundary: Point[], thickness: number): number[] {
  const positions: number[] = []
  const bottomY = FLOOR_DATUM_Y - thickness
  for (let i = 0; i < boundary.length; i += 1) {
    const start = boundary[i] as Point
    const end = boundary[(i + 1) % boundary.length] as Point
    const inward = inwardEdgeNormal(start, end)
    const insetStart = shift(start, inward, SLAB_SIDE_FACE_INSET_MM)
    const insetEnd = shift(end, inward, SLAB_SIDE_FACE_INSET_MM)
    pushWorldPoint(positions, insetEnd, bottomY)
    pushWorldPoint(positions, insetEnd, FLOOR_DATUM_Y)
    pushWorldPoint(positions, insetStart, FLOOR_DATUM_Y)
    pushWorldPoint(positions, insetStart, bottomY)
    pushWorldPoint(positions, insetEnd, bottomY)
    pushWorldPoint(positions, insetStart, FLOOR_DATUM_Y)
  }
  return positions
}

/**
 * Triangulates the slab cap, cutting `holeLoops` out of `boundary`. The index
 * triples reference the concatenated point array `[...boundary, ...holeLoops.flat()]`.
 */
function slabCapTriangles(boundary: Point[], holeLoops: Point[][]): Triangle[] {
  const contour = boundary.map((p) => new THREE.Vector2(p.x, p.y))
  const holes = holeLoops.map((loop) => loop.map((p) => new THREE.Vector2(p.x, p.y)))
  return THREE.ShapeUtils.triangulateShape(contour, holes) as Triangle[]
}

/**
 * The room's horizontal cap triangulation, shared by the floor slab and the
 * ceiling. `triangles` index into `points` (the outer boundary followed by each
 * hole loop), so any interior void is already cut out. `boundary` separately
 * drives the slab's vertical sides.
 */
interface RoomCapGeometry {
  boundary: Point[]
  points: Point[]
  triangles: Triangle[]
}

function roomCapGeometry(boundary: Point[], holes?: Point[][]): RoomCapGeometry {
  const canonicalBoundary = canonicalOuterLoop(boundary)
  const holeLoops = (holes ?? []).map(canonicalHoleLoop)
  return {
    boundary: canonicalBoundary,
    points: [...canonicalBoundary, ...holeLoops.flat()],
    triangles: slabCapTriangles(canonicalBoundary, holeLoops),
  }
}

/** The slab's three contiguous sections, in geometry order: top, base, sides. */
function slabSections(cap: RoomCapGeometry, thickness: number): SlabSection[] {
  // The axis map is orientation-preserving, so the natural triangulation already
  // winds the caps to face up: the top cap keeps that order to face `+Y` while the
  // downward (base) cap reverses its winding to face `-Y`.
  const baseTriangles = reverseTriangleWinding(cap.triangles)
  return [
    { role: 'top', positions: slabCapPositions(cap.points, cap.triangles, FLOOR_DATUM_Y) },
    {
      role: 'base',
      positions: slabCapPositions(cap.points, baseTriangles, FLOOR_DATUM_Y - thickness),
    },
    { role: 'exteriorFace', positions: slabSidePositions(cap.boundary, thickness) },
  ]
}

/** A non-indexed buffer geometry from a flat world-position array. */
function geometryFromPositions(positions: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, COMPONENTS_PER_VERTEX),
  )
  return geometry
}

/** Adds one material group per section, advancing the running vertex offset. */
function addSlabGroups(geometry: THREE.BufferGeometry, sections: SlabSection[]): void {
  let runningStart = 0
  sections.forEach((section, materialIndex) => {
    const vertexCount = section.positions.length / COMPONENTS_PER_VERTEX
    geometry.addGroup(runningStart, vertexCount, materialIndex)
    runningStart += vertexCount
  })
}

/**
 * Builds the floor slab as a solid prism: a top cap at the floor datum (Y = 0),
 * a bottom cap at Y = -thickness, and vertical sides connecting them. Every
 * vertex passes through `planToWorld`, so the slab shares the walls' axis map.
 * Each section draws its own surface role through a per-section material group.
 */
function buildSlabMesh(
  node: RoomSceneNode,
  materials: MaterialProvider,
  floorId: string,
): THREE.Mesh {
  const sections = slabSections(
    roomCapGeometry(node.outerPolygon ?? node.clearPolygon, node.holes),
    floorSlabThickness(),
  )
  const geometry = geometryFromPositions(sections.flatMap((section) => section.positions))
  addSlabGroups(geometry, sections)
  geometry.computeVertexNormals()
  const slabMaterials = sections.map((section) =>
    materials.material(
      section.role,
      section.role === 'top' ? { kind: 'floor', floorId } : undefined,
    ),
  )
  const mesh = new THREE.Mesh(geometry, slabMaterials)
  // The slab carries its floor surface ref, so a 3D pick walks up to the same
  // SurfaceRef the 2D plan paints (ADR-0056); the active paint target stays
  // consistent across both views.
  mesh.userData.surface = { kind: 'floor', floorId }
  return mesh
}

/**
 * Builds the ceiling as a single downward-facing plane at the room's ceiling
 * height. The axis map is orientation-preserving, so the slab's cap triangulation
 * faces world `+Y` in its natural order; the ceiling reverses that winding to face
 * world `-Y` (down into the room) and draws the `base` role.
 */
function buildCeilingMesh(
  node: RoomSceneNode,
  materials: MaterialProvider,
  floorId: string,
): THREE.Mesh {
  // The ceiling bounds the clear interior, not the full slab footprint that now reaches the wall outer faces.
  const cap = roomCapGeometry(node.clearPolygon, node.holes)
  const positions = slabCapPositions(
    cap.points,
    reverseTriangleWinding(cap.triangles),
    ceilingHeight(node),
  )
  const geometry = geometryFromPositions(positions)
  geometry.computeVertexNormals()
  return new THREE.Mesh(geometry, materials.material('base', { kind: 'ceiling', floorId }))
}

/**
 * Builds the shell for one derived room, returning a group named with the
 * room's id and carrying `userData.entityId`, so a raycaster walks up to the
 * room. The group holds the floor slab mesh and the ceiling plane above it.
 */
export function buildRoomShell(node: RoomSceneNode, materials: MaterialProvider): THREE.Group {
  const { floorId } = node
  const group = new THREE.Group()
  group.name = node.id
  group.userData.entityId = node.id
  group.add(buildSlabMesh(node, materials, floorId))
  group.add(buildCeilingMesh(node, materials, floorId))
  return group
}
