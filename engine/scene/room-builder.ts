import * as THREE from 'three'

import {
  canonicalHoleLoop,
  canonicalOuterLoop,
  ceilingHeight,
  floorSlabThickness,
  planToWorld,
  type Point,
  type RoomSceneNode,
} from '../../core'
import type { MaterialProvider, SurfaceRole } from '../materials/material-provider'

/** The finished-floor datum: the slab's top sits at local world Y = 0. */
const FLOOR_DATUM_Y = 0
/** Three position components (x, y, z) per vertex. */
const COMPONENTS_PER_VERTEX = 3

type Triangle = [number, number, number]

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

/** Reverses each triangle's vertex order, flipping the cap's face direction. */
function reverseTriangleWinding(triangles: Triangle[]): Triangle[] {
  return triangles.map((triangle) => [...triangle].reverse() as Triangle)
}

/** Positions for the vertical sides connecting the top and bottom caps. */
function slabSidePositions(boundary: Point[], thickness: number): number[] {
  const positions: number[] = []
  const bottomY = FLOOR_DATUM_Y - thickness
  for (let i = 0; i < boundary.length; i += 1) {
    const start = boundary[i] as Point
    const end = boundary[(i + 1) % boundary.length] as Point
    pushWorldPoint(positions, start, FLOOR_DATUM_Y)
    pushWorldPoint(positions, end, FLOOR_DATUM_Y)
    pushWorldPoint(positions, end, bottomY)
    pushWorldPoint(positions, start, FLOOR_DATUM_Y)
    pushWorldPoint(positions, end, bottomY)
    pushWorldPoint(positions, start, bottomY)
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

function roomCapGeometry(node: RoomSceneNode): RoomCapGeometry {
  const boundary = canonicalOuterLoop(node.clearPolygon)
  const holeLoops = (node.holes ?? []).map(canonicalHoleLoop)
  return {
    boundary,
    points: [...boundary, ...holeLoops.flat()],
    triangles: slabCapTriangles(boundary, holeLoops),
  }
}

/** The slab's three contiguous sections, in geometry order: top, base, sides. */
function slabSections(cap: RoomCapGeometry, thickness: number): SlabSection[] {
  // The triangulation winds the caps to face down after the orientation-flipping
  // axis map, so the upward (top) cap reverses its winding to face `+Y` while the
  // downward (base) cap keeps the order to face `-Y`.
  const topTriangles = reverseTriangleWinding(cap.triangles)
  return [
    { role: 'top', positions: slabCapPositions(cap.points, topTriangles, FLOOR_DATUM_Y) },
    {
      role: 'base',
      positions: slabCapPositions(cap.points, cap.triangles, FLOOR_DATUM_Y - thickness),
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
function buildSlabMesh(node: RoomSceneNode, materials: MaterialProvider): THREE.Mesh {
  const sections = slabSections(roomCapGeometry(node), floorSlabThickness())
  const geometry = geometryFromPositions(sections.flatMap((section) => section.positions))
  addSlabGroups(geometry, sections)
  geometry.computeVertexNormals()
  const slabMaterials = sections.map((section) => materials.material(section.role))
  return new THREE.Mesh(geometry, slabMaterials)
}

/**
 * Builds the ceiling as a single downward-facing plane at the room's ceiling
 * height. It reuses the slab's cap triangulation in its natural order, which
 * faces world `-Y` (down into the room), and draws the `base` role.
 */
function buildCeilingMesh(node: RoomSceneNode, materials: MaterialProvider): THREE.Mesh {
  const cap = roomCapGeometry(node)
  const positions = slabCapPositions(cap.points, cap.triangles, ceilingHeight(node))
  const geometry = geometryFromPositions(positions)
  geometry.computeVertexNormals()
  return new THREE.Mesh(geometry, materials.material('base'))
}

/**
 * Builds the shell for one derived room, returning a group named with the
 * room's id and carrying `userData.entityId`, so a raycaster walks up to the
 * room. The group holds the floor slab mesh and the ceiling plane above it.
 */
export function buildRoomShell(node: RoomSceneNode, materials: MaterialProvider): THREE.Group {
  const group = new THREE.Group()
  group.name = node.id
  group.userData.entityId = node.id
  group.add(buildSlabMesh(node, materials))
  group.add(buildCeilingMesh(node, materials))
  return group
}
