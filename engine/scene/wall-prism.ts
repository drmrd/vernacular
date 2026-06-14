import * as THREE from 'three'

import {
  WALL_NODE_PREFIX,
  distance,
  planToWorld,
  wallHeight,
  type Point,
  type SurfaceRef,
  type WallFootprint,
  type WallSceneNode,
} from '../../core'
import type { MaterialProvider } from '../materials/material-provider'

import { geometryFromSections, thicknessSpanningQuad, type WallSection } from './geometry-utils'

/** The paint surface ref for one named side of a wall's long face. */
export function wallFaceRef(wallId: string, side: 'left' | 'right'): SurfaceRef {
  return { kind: 'wall-face', wallId, side }
}

/**
 * Builds the solid mesh for one wall from a square footprint: a prism with both
 * ends squared, which is the box the wall shell drew before junctions were
 * mitered. The square footprint comes from the centerline offset half the
 * thickness to each side; the prism builder places it in world space.
 */
export function buildWallMesh(node: WallSceneNode, materials: MaterialProvider): THREE.Mesh {
  return buildWallPrism(node, squareFootprint(node), materials)
}

/**
 * Builds the solid prism mesh for one wall from its plan-space footprint, in the
 * pinned world-space convention (ADR-0045): plan x maps to world X, plan y maps
 * to world Z, and the vertical axis is world Y. The footprint's four corners give
 * the two long faces (one per side) and the two end caps (square or along a miter
 * line); the prism rises from world Y = 0 to the wall height and is capped top and
 * base. The six sections carry the shell roles in the box's group order (the two
 * end caps, top, base, then the interior and exterior long faces), so a square
 * footprint reproduces the box and the paint refs land on the two long faces.
 */
export function buildWallPrism(
  node: WallSceneNode,
  footprint: WallFootprint,
  materials: MaterialProvider,
): THREE.Mesh {
  const sections = prismSections(
    footprint,
    wallHeight(node),
    node.id.slice(WALL_NODE_PREFIX.length),
  )
  const geometry = geometryFromSections(sections)
  const material = sections.map((section) => materials.material(section.role, section.ref))
  const mesh = new THREE.Mesh(geometry, material)
  mesh.userData.entityId = node.id
  return mesh
}

/** The square footprint of a free-standing wall: its centerline offset half the
 *  thickness to each side, both ends squared. */
function squareFootprint(node: WallSceneNode): WallFootprint {
  const normal = leftUnitNormal(node.start, node.end)
  const half = node.thickness / 2
  return {
    aPlus: shiftPoint(node.start, normal, half),
    aMinus: shiftPoint(node.start, normal, -half),
    bPlus: shiftPoint(node.end, normal, half),
    bMinus: shiftPoint(node.end, normal, -half),
  }
}

/**
 * The six wall-prism sections in the box's group order: the two end caps and the
 * top and base (all role-only), then the `+normal` interior long face (paint side
 * 'left') and the `-normal` exterior long face (paint side 'right'). Each face is
 * wound so its normal points outward.
 */
function prismSections(footprint: WallFootprint, height: number, wallId: string): WallSection[] {
  const { aPlus, aMinus, bPlus, bMinus } = footprint
  return [
    { role: 'exteriorFace', positions: faceQuad(aMinus, aPlus, height) },
    { role: 'exteriorFace', positions: faceQuad(bPlus, bMinus, height) },
    { role: 'top', positions: capQuad([aMinus, aPlus, bPlus, bMinus], height) },
    { role: 'base', positions: capQuad([aPlus, aMinus, bMinus, bPlus], 0) },
    {
      role: 'interiorFace',
      positions: faceQuad(aPlus, bPlus, height),
      ref: wallFaceRef(wallId, 'left'),
    },
    {
      role: 'exteriorFace',
      positions: faceQuad(bMinus, aMinus, height),
      ref: wallFaceRef(wallId, 'right'),
    },
  ]
}

/** A vertical face quad from `from` to `to`, rising from the base to `height`. */
function faceQuad(from: Point, to: Point, height: number): number[] {
  return thicknessSpanningQuad([
    cornerWorld(from, 0),
    cornerWorld(to, 0),
    cornerWorld(to, height),
    cornerWorld(from, height),
  ])
}

/** A flat cap quad: the four footprint corners placed at one height. */
function capQuad(corners: [Point, Point, Point, Point], height: number): number[] {
  const [first, second, third, fourth] = corners
  return thicknessSpanningQuad([
    cornerWorld(first, height),
    cornerWorld(second, height),
    cornerWorld(third, height),
    cornerWorld(fourth, height),
  ])
}

/** A plan-space corner at `height` as a world-space point through `planToWorld`. */
function cornerWorld(plan: Point, height: number): THREE.Vector3 {
  const world = planToWorld(plan, height)
  return new THREE.Vector3(world.x, world.y, world.z)
}

/** Unit left-hand normal of the direction `a -> b`. */
function leftUnitNormal(a: Point, b: Point): Point {
  const length = distance(a, b)
  return { x: -(b.y - a.y) / length, y: (b.x - a.x) / length }
}

/** `point` shifted by `offset` along the unit `direction`. */
function shiftPoint(point: Point, direction: Point, offset: number): Point {
  return { x: point.x + direction.x * offset, y: point.y + direction.y * offset }
}
