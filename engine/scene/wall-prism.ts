import * as THREE from 'three'

import {
  WALL_NODE_PREFIX,
  leftNormal,
  planToWorld,
  shift,
  signedArea,
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
  const normal = leftNormal(node.start, node.end)
  const half = node.thickness / 2
  return {
    aPlus: shift(node.start, normal, half),
    aMinus: shift(node.start, normal, -half),
    bPlus: shift(node.end, normal, half),
    bMinus: shift(node.end, normal, -half),
  }
}

/**
 * mm^2 below which a footprint is degenerate. A real wall footprint spans many
 * orders of magnitude more area, so this only catches a footprint collapsed to a
 * point or self-intersecting with zero net area, where a cap would draw backward
 * or as a zero-area triangle. Such a footprint contributes no top or base cap.
 */
const CAP_AREA_EPSILON = 1e-6

/**
 * The wall-prism sections in the box's group order: the two end caps, then the top
 * and base caps (when the footprint is non-degenerate), then the `+normal` interior
 * long face (paint side 'left') and the `-normal` exterior long face (paint side
 * 'right'). Each face is wound so its normal points outward; the caps are wound from
 * the footprint's signed area so the top faces +Y and the base faces -Y. A
 * degenerate footprint drops both caps, leaving the four non-cap sections in order.
 */
function prismSections(footprint: WallFootprint, height: number, wallId: string): WallSection[] {
  const { aPlus, aMinus, bPlus, bMinus } = footprint
  return [
    { role: 'exteriorFace', positions: faceQuad(aMinus, aPlus, height) },
    { role: 'exteriorFace', positions: faceQuad(bPlus, bMinus, height) },
    ...capSections(footprint, height),
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

/**
 * The top and base cap sections wound from the footprint's signed area, or none for
 * a degenerate footprint. A clockwise perimeter (negative area) winds the top cap so
 * its normal faces +Y; the base reverses that to face -Y.
 */
function capSections(footprint: WallFootprint, height: number): WallSection[] {
  const { aPlus, aMinus, bPlus, bMinus } = footprint
  const perimeter: CapCorners = [aPlus, bPlus, bMinus, aMinus]
  const area = signedArea(perimeter)
  if (Math.abs(area) < CAP_AREA_EPSILON) {
    return []
  }
  const topCorners = area < 0 ? perimeter : reverseCorners(perimeter)
  const baseCorners = reverseCorners(topCorners)
  return [
    { role: 'top', positions: capQuad(topCorners, height) },
    { role: 'base', positions: capQuad(baseCorners, 0) },
  ]
}

/** A cap's four perimeter corners, ordered around its loop. */
type CapCorners = [Point, Point, Point, Point]

/** The four corners in reverse loop order, flipping the cap's winding. */
function reverseCorners([first, second, third, fourth]: CapCorners): CapCorners {
  return [fourth, third, second, first]
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
function capQuad(corners: CapCorners, height: number): number[] {
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
