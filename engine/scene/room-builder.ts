import * as THREE from 'three'

import {
  canonicalOuterLoop,
  floorSlabThickness,
  planToWorld,
  type Point,
  type RoomSceneNode,
} from '../../core'
import type { MaterialProvider } from '../materials/material-provider'

/** The finished-floor datum: the slab's top sits at local world Y = 0. */
const FLOOR_DATUM_Y = 0
/** Three position components (x, y, z) per vertex. */
const COMPONENTS_PER_VERTEX = 3

type Triangle = [number, number, number]

/** Pushes a plan boundary point, at the given height, as a world position. */
function pushWorldPoint(positions: number[], point: Point, height: number): void {
  const world = planToWorld(point, height)
  positions.push(world.x, world.y, world.z)
}

/** Positions for one horizontal cap (top or bottom) of the slab prism. */
function slabCapPositions(boundary: Point[], triangles: Triangle[], height: number): number[] {
  const positions: number[] = []
  for (const triangle of triangles) {
    for (const index of triangle) {
      pushWorldPoint(positions, boundary[index] as Point, height)
    }
  }
  return positions
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

/** Triangulates the slab cap and returns index triples into `boundary`. */
function slabCapTriangles(boundary: Point[]): Triangle[] {
  const contour = boundary.map((p) => new THREE.Vector2(p.x, p.y))
  return THREE.ShapeUtils.triangulateShape(contour, []) as Triangle[]
}

/**
 * Builds the floor slab as a solid prism: a top cap at the floor datum (Y = 0),
 * a bottom cap at Y = -thickness, and vertical sides connecting them. Every
 * vertex passes through `planToWorld`, so the slab shares the walls' axis map.
 */
function buildSlabMesh(node: RoomSceneNode, materials: MaterialProvider): THREE.Mesh {
  const boundary = canonicalOuterLoop(node.clearPolygon)
  const thickness = floorSlabThickness()
  const triangles = slabCapTriangles(boundary)
  const positions = [
    ...slabCapPositions(boundary, triangles, FLOOR_DATUM_Y),
    ...slabCapPositions(boundary, triangles, FLOOR_DATUM_Y - thickness),
    ...slabSidePositions(boundary, thickness),
  ]
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, COMPONENTS_PER_VERTEX),
  )
  geometry.computeVertexNormals()
  return new THREE.Mesh(geometry, materials.material('top'))
}

/**
 * Builds the shell for one derived room, returning a group named with the
 * room's id and carrying `userData.entityId`, so a raycaster walks up to the
 * room. The group holds the floor slab mesh (the ceiling arrives next cycle).
 */
export function buildRoomShell(node: RoomSceneNode, materials: MaterialProvider): THREE.Group {
  const group = new THREE.Group()
  group.name = node.id
  group.userData.entityId = node.id
  group.add(buildSlabMesh(node, materials))
  return group
}
