import * as THREE from 'three'

import {
  builtinElementTypes,
  openingFill,
  planToWorld,
  type ElementType,
  type OpeningFillPart,
  type OpeningSceneNode,
  type Point,
  type Registry,
  type Vector3,
} from '../../core'
import type { MaterialProvider } from '../materials/material-provider'

const COMPONENTS_PER_VERTEX = 3

/**
 * Builds the solid body for one opening as a group of thin boxes, one per fill
 * part from {@link openingFill}. The group is named with the opening's id and
 * carries `userData.entityId`, so a raycaster walks up to the opening. Each box
 * is placed in world space through {@link planToWorld}, sharing the wall shell's
 * axis map.
 */
export function buildOpeningFill(
  node: OpeningSceneNode,
  materials: MaterialProvider,
  elementTypes: Registry<ElementType> = builtinElementTypes,
): THREE.Group {
  const group = new THREE.Group()
  group.name = node.id
  group.userData.entityId = node.id
  for (const part of openingFill(node, elementTypes)) {
    group.add(buildPartMesh(node, part, materials))
  }
  return group
}

function buildPartMesh(
  node: OpeningSceneNode,
  part: OpeningFillPart,
  materials: MaterialProvider,
): THREE.Mesh {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(boxPositions(node, part), COMPONENTS_PER_VERTEX),
  )
  geometry.computeVertexNormals()
  return new THREE.Mesh(geometry, materials.material(part.role))
}

/** A box corner as a bit per axis: 0 picks the min extent, 1 picks the max. */
interface CornerBits {
  along: 0 | 1
  up: 0 | 1
  across: 0 | 1
}

/** The two extents (min, max) of one box on its three opening-local axes. */
interface BoxExtents {
  along: readonly [number, number]
  up: readonly [number, number]
  across: readonly [number, number]
}

/** Maps an opening-local corner to world space, picking each axis extent by bit. */
function cornerToWorld(node: OpeningSceneNode, extents: BoxExtents, bits: CornerBits): Vector3 {
  const along = extents.along[bits.along]
  const up = extents.up[bits.up]
  const across = extents.across[bits.across]
  const planPoint: Point = {
    x: node.center.x + along * node.along.x + across * node.normal.x,
    y: node.center.y + along * node.along.y + across * node.normal.y,
  }
  return planToWorld(planPoint, up)
}

/** One box face: its four corners in winding order. Winding is irrelevant here:
 *  leaf and glass materials render DoubleSide. */
type Quad = readonly [CornerBits, CornerBits, CornerBits, CornerBits]

/** A corner from its three axis bits, for the named face tables below. */
function cornerBits(along: 0 | 1, up: 0 | 1, across: 0 | 1): CornerBits {
  return { along, up, across }
}

// The six faces of the box, each named for the axis and polarity it lies on. A
// face lists its four corners; winding is irrelevant (leaf and glass render
// DoubleSide), so the corner order only has to enclose the face.
const ALONG_MIN_FACE: Quad = [
  cornerBits(0, 0, 0),
  cornerBits(0, 0, 1),
  cornerBits(0, 1, 1),
  cornerBits(0, 1, 0),
]
const ALONG_MAX_FACE: Quad = [
  cornerBits(1, 0, 0),
  cornerBits(1, 1, 0),
  cornerBits(1, 1, 1),
  cornerBits(1, 0, 1),
]
const UP_MIN_FACE: Quad = [
  cornerBits(0, 0, 0),
  cornerBits(1, 0, 0),
  cornerBits(1, 0, 1),
  cornerBits(0, 0, 1),
]
const UP_MAX_FACE: Quad = [
  cornerBits(0, 1, 0),
  cornerBits(0, 1, 1),
  cornerBits(1, 1, 1),
  cornerBits(1, 1, 0),
]
const ACROSS_MIN_FACE: Quad = [
  cornerBits(0, 0, 0),
  cornerBits(0, 1, 0),
  cornerBits(1, 1, 0),
  cornerBits(1, 0, 0),
]
const ACROSS_MAX_FACE: Quad = [
  cornerBits(0, 0, 1),
  cornerBits(1, 0, 1),
  cornerBits(1, 1, 1),
  cornerBits(0, 1, 1),
]

const BOX_FACES: ReadonlyArray<Quad> = [
  ALONG_MIN_FACE,
  ALONG_MAX_FACE,
  UP_MIN_FACE,
  UP_MAX_FACE,
  ACROSS_MIN_FACE,
  ACROSS_MAX_FACE,
]

/** The two extents of one fill-part box, centered on the wall centerline across. */
function boxExtents(part: OpeningFillPart): BoxExtents {
  const half = part.thickness / 2
  return {
    along: [part.along.min, part.along.max],
    up: [part.up.min, part.up.max],
    across: [-half, half],
  }
}

/** The 6 faces (12 triangles) of one fill-part box as a flat world-position array. */
function boxPositions(node: OpeningSceneNode, part: OpeningFillPart): number[] {
  const extents = boxExtents(part)
  const positions: number[] = []
  for (const [p, q, r, s] of BOX_FACES) {
    // Two triangles split the quad on the p->r diagonal: (p, q, r) and (p, r, s).
    for (const corner of [p, q, r, p, r, s]) {
      const world = cornerToWorld(node, extents, corner)
      positions.push(world.x, world.y, world.z)
    }
  }
  return positions
}
