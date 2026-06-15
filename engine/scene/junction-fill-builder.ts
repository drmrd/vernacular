import * as THREE from 'three'

import { type JunctionFill, type Point, planToWorld } from '../../core'
import type { MaterialProvider } from '../materials/material-provider'

import {
  geometryFromSections,
  reverseTriangleWinding,
  type Triangle,
  type WallSection,
} from './geometry-utils'

/** The datum the junction fill rises from: its base sits at world Y = 0. */
const FILL_BASE_Y = 0

/** Pushes a plan polygon point, at the given world height, as a world position. */
function pushWorldPoint(positions: number[], point: Point, height: number): void {
  const world = planToWorld(point, height)
  positions.push(world.x, world.y, world.z)
}

/** Triangulates the fill polygon (no holes) into index triples over `polygon`. */
function capTriangles(polygon: Point[]): Triangle[] {
  const contour = polygon.map((p) => new THREE.Vector2(p.x, p.y))
  return THREE.ShapeUtils.triangulateShape(contour, []) as Triangle[]
}

/** Positions for one horizontal cap of the prism, placing each triangle at `height`. */
function capPositions(polygon: Point[], triangles: Triangle[], height: number): number[] {
  const positions: number[] = []
  for (const triangle of triangles) {
    for (const index of triangle) {
      pushWorldPoint(positions, polygon[index] as Point, height)
    }
  }
  return positions
}

/** Positions for the vertical sides spanning the base (Y = 0) up to `height`. */
function sidePositions(polygon: Point[], height: number): number[] {
  const positions: number[] = []
  for (let i = 0; i < polygon.length; i += 1) {
    const start = polygon[i] as Point
    const end = polygon[(i + 1) % polygon.length] as Point
    pushWorldPoint(positions, start, FILL_BASE_Y)
    pushWorldPoint(positions, end, FILL_BASE_Y)
    pushWorldPoint(positions, end, height)
    pushWorldPoint(positions, start, FILL_BASE_Y)
    pushWorldPoint(positions, end, height)
    pushWorldPoint(positions, start, height)
  }
  return positions
}

/** The fill's three contiguous sections, in geometry order: top, base, sides. */
function fillSections(polygon: Point[], height: number): WallSection[] {
  const triangles = capTriangles(polygon)
  // The triangulation winds the caps to face down after the orientation-flipping
  // axis map, so the upward (top) cap reverses its winding to face `+Y` while the
  // downward (base) cap keeps the order to face `-Y`.
  const topTriangles = reverseTriangleWinding(triangles)
  return [
    { role: 'top', positions: capPositions(polygon, topTriangles, height) },
    { role: 'base', positions: capPositions(polygon, triangles, FILL_BASE_Y) },
    { role: 'junction', positions: sidePositions(polygon, height) },
  ]
}

/**
 * Builds a wall-junction fill as a solid prism rising from the datum (Y = 0) to
 * `height`: a top cap at `height`, a base cap at Y = 0, and one vertical side
 * face per polygon edge connecting them. Every vertex passes through
 * `planToWorld`, so the fill shares the walls' axis map. Each section draws its
 * own surface role (`top`, `base`, then `junction` for the sides) through a
 * per-section material group. The mesh carries no `userData.entityId`.
 */
export function buildJunctionFill(
  fill: JunctionFill,
  height: number,
  materials: MaterialProvider,
): THREE.Mesh {
  const sections = fillSections(fill.polygon, height)
  const geometry = geometryFromSections(sections)
  const fillMaterials = sections.map((section) => materials.material(section.role))
  return new THREE.Mesh(geometry, fillMaterials)
}
