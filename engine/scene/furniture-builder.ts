import * as THREE from 'three'

import { FURNITURE_NODE_PREFIX, type FurnitureSceneNode, type Point, planToWorld } from '../../core'
import type { MaterialProvider, SurfaceRole } from '../materials/material-provider'
import { furnitureBaseDepthBiasParameters } from '../materials/role-appearance'

import {
  geometryFromSections,
  reverseTriangleWinding,
  type Triangle,
  type WallSection,
} from './geometry-utils'

const FURNITURE_ROLE: SurfaceRole = 'furniture'

/** Pushes a plan polygon point, at the given world height, as a world position. */
function pushWorldPoint(positions: number[], point: Point, height: number): void {
  const world = planToWorld(point, height)
  positions.push(world.x, world.y, world.z)
}

/** Triangulates the footprint polygon (no holes) into index triples over `polygon`. */
function capTriangles(polygon: readonly Point[]): Triangle[] {
  const contour = polygon.map((p) => new THREE.Vector2(p.x, p.y))
  return THREE.ShapeUtils.triangulateShape(contour, []) as Triangle[]
}

/** Positions for one horizontal cap of the box, placing each triangle at `height`. */
function capPositions(polygon: readonly Point[], triangles: Triangle[], height: number): number[] {
  const positions: number[] = []
  for (const triangle of triangles) {
    for (const index of triangle) {
      pushWorldPoint(positions, polygon[index] as Point, height)
    }
  }
  return positions
}

/** Positions for the vertical sides spanning `base` up to `top`. */
function sidePositions(polygon: readonly Point[], base: number, top: number): number[] {
  const positions: number[] = []
  for (let i = 0; i < polygon.length; i += 1) {
    const start = polygon[i] as Point
    const end = polygon[(i + 1) % polygon.length] as Point
    pushWorldPoint(positions, start, base)
    pushWorldPoint(positions, end, base)
    pushWorldPoint(positions, end, top)
    pushWorldPoint(positions, start, base)
    pushWorldPoint(positions, end, top)
    pushWorldPoint(positions, start, top)
  }
  return positions
}

// planToWorld is orientation-preserving, so the natural triangulation already faces +Y: the top cap
// keeps that order while the base reverses its winding to face -Y; the sides span base to top. Mirrors
// junction-fill so the box reads solid from outside under front-side culling.
function boxSections(
  corners: readonly Point[],
  base: number,
  top: number,
  role: SurfaceRole,
): WallSection[] {
  const triangles = capTriangles(corners)
  return [
    {
      role,
      positions: capPositions(corners, triangles, top),
    },
    { role, positions: capPositions(corners, reverseTriangleWinding(triangles), base) },
    { role, positions: sidePositions(corners, base, top) },
  ]
}

/**
 * The base-cap variant of the furniture material: the same state appearance carrying the
 * furniture-base depth bias, mirroring how the painted slab top spreads its bias. The cap alone
 * loses the depth test to the floor it rests on, so the box sides and top stay unbiased (ADR-0141).
 */
function furnitureBaseMaterial(material: THREE.Material): THREE.Material {
  const biased = material.clone()
  biased.setValues(furnitureBaseDepthBiasParameters())
  return biased
}

/**
 * Materials for the box's `[top, base, sides]` sections in the order {@link boxSections} emits them,
 * so the base cap carries the furniture-base bias while the shared box material draws the top and
 * the sides unbiased.
 */
function boxMaterials(boxMaterial: THREE.Material): THREE.Material[] {
  return [boxMaterial, furnitureBaseMaterial(boxMaterial), boxMaterial]
}

/**
 * Builds a furniture instance's massing as a solid box rising from its elevation to
 * elevationZ + height over the rotated footprint corners. Every vertex passes through
 * planToWorld, so the box shares the walls' axis map; the single neutral 'furniture'
 * material draws all faces. The group name is the prefixed scene id, but
 * userData.entityId is the RAW instance id (the prefix stripped): the 2D selection keys
 * furniture on the raw id, so the generic 3D pick and outline select in step with the plan.
 * userData.furnitureMassing flags the group as a placeholder box, so a loaded model
 * sub-group is distinguishable from it now that the edge overlay (which used to mark the
 * box) is an opt-in view toggle, off by default (ADR-0132). The box is multi-material: the
 * base cap carries the furniture-base depth bias, the sides and top stay unbiased (ADR-0141).
 */
export function buildFurnitureMassing(
  node: FurnitureSceneNode,
  materials: MaterialProvider,
  role: SurfaceRole = FURNITURE_ROLE,
): THREE.Group {
  const base = node.elevationZ
  const top = node.elevationZ + node.height
  const geometry = geometryFromSections(boxSections(node.footprintCorners, base, top, role))
  const mesh = new THREE.Mesh(geometry, boxMaterials(materials.material(role)))
  const group = new THREE.Group()
  group.add(mesh)
  group.name = node.id
  group.userData.entityId = node.id.slice(FURNITURE_NODE_PREFIX.length)
  group.userData.furnitureMassing = true
  return group
}
