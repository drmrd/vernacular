import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import type { PlanarGraph, WallSceneNode } from '../../core'
import { NeutralMaterialProvider } from '../materials/neutral-material-provider'
import { materialGroups } from '../testing'

import { buildWalls } from './wall-builder'
import {
  AREA_TOLERANCE,
  CUT_FACE_AREA,
  FACE_GROUP_COUNT,
  FULL_THICKNESS_SPAN,
  HALF_THICKNESS,
  HEIGHT,
  PRECISION,
  SPLIT_X,
  THICKNESS,
  VOID_HEIGHT,
  VOID_WIDTH,
  WALL_FACE_AREA,
  WALL_LENGTH,
  centeredOpening,
  expectBoxSpan,
  horizontalWall,
  maxAxisOfRole,
  meshesOf,
  roleArea,
  singleWallMesh,
  splitEdgeGraph,
  wallGroup,
} from './wall-test-support'

describe('buildWalls', () => {
  it('builds a single box for an unsplit wall with no openings', () => {
    const meshes = meshesOf(wallGroup())
    expect(meshes).toHaveLength(1)

    const mesh = meshes[0]
    expect(mesh).toBeDefined()
    if (mesh === undefined) return
    expect(mesh.userData.entityId).toBe('wall:w1')
    expect(materialGroups(mesh.geometry)).toHaveLength(FACE_GROUP_COUNT)
    expectBoxSpan(mesh, { x: [0, WALL_LENGTH], y: [0, HEIGHT], z: FULL_THICKNESS_SPAN })
  })

  it('builds one box per edge for a split wall, both carrying the wall node id', () => {
    const meshes = meshesOf(wallGroup([], splitEdgeGraph()))
    expect(meshes).toHaveLength(2)
    expect(meshes.every((mesh) => mesh.userData.entityId === 'wall:w1')).toBe(true)

    const [first, second] = meshes.sort(
      (left, right) =>
        new THREE.Box3().setFromObject(left).min.x - new THREE.Box3().setFromObject(right).min.x,
    )
    expect(first).toBeDefined()
    expect(second).toBeDefined()
    if (first === undefined || second === undefined) return

    expectBoxSpan(first, { x: [0, SPLIT_X], y: [0, HEIGHT], z: FULL_THICKNESS_SPAN })
    expectBoxSpan(second, { x: [SPLIT_X, WALL_LENGTH], y: [0, HEIGHT], z: FULL_THICKNESS_SPAN })
  })

  it('miters the shared corner of two plain walls meeting at a right angle', () => {
    // An L: wall A runs east, wall B turns north from A's far end. Their shared
    // corner (WALL_LENGTH, 0) carries two incident edges, so A's b-end miters: its
    // interior (+normal) face pulls in to the inner corner and its exterior
    // (-normal) face reaches out to the outer corner.
    const wallA = horizontalWall({ id: 'wall:a' })
    const wallB: WallSceneNode = {
      id: 'wall:b',
      kind: 'wall',
      floorId: 'demo',
      start: { x: WALL_LENGTH, y: 0 },
      end: { x: WALL_LENGTH, y: WALL_LENGTH },
      thickness: THICKNESS,
      height: HEIGHT,
    }
    const graph: PlanarGraph = {
      vertices: [
        { x: 0, y: 0 },
        { x: WALL_LENGTH, y: 0 },
        { x: WALL_LENGTH, y: WALL_LENGTH },
      ],
      edges: [
        { a: 0, b: 1, wallId: 'a' },
        { a: 1, b: 2, wallId: 'b' },
      ],
    }

    const group = buildWalls({
      graph,
      walls: [wallA, wallB],
      openingsByWall: new Map(),
      materials: new NeutralMaterialProvider(),
    })
    const meshA = meshesOf(group).find((mesh) => mesh.userData.entityId === 'wall:a')
    expect(meshA).toBeDefined()
    if (meshA === undefined) return

    expect(maxAxisOfRole(meshA, 'interiorFace', 'x')).toBeCloseTo(
      WALL_LENGTH - HALF_THICKNESS,
      PRECISION,
    )
    expect(maxAxisOfRole(meshA, 'exteriorFace', 'x')).toBeCloseTo(
      WALL_LENGTH + HALF_THICKNESS,
      PRECISION,
    )
  })
})

describe('buildWalls opening voids', () => {
  it('cuts the opening void out of the wall long faces', () => {
    const mesh = singleWallMesh([centeredOpening()])
    expect(mesh).toBeDefined()
    if (mesh === undefined) return
    expect(Math.abs(roleArea(mesh, 'interiorFace') - CUT_FACE_AREA)).toBeLessThan(AREA_TOLERANCE)
  })

  it('leaves the long faces solid when the wall has no openings', () => {
    const mesh = singleWallMesh()
    expect(mesh).toBeDefined()
    if (mesh === undefined) return
    expect(Math.abs(roleArea(mesh, 'interiorFace') - WALL_FACE_AREA)).toBeLessThan(AREA_TOLERANCE)
  })
})

describe('buildWalls opening reveals', () => {
  it('lines a sill-zero door void with reveals on the head and jambs but not the floor sill', () => {
    const mesh = singleWallMesh([centeredOpening({ sillHeight: 0 })])
    expect(mesh).toBeDefined()
    if (mesh === undefined) return

    // Head plus two jambs lined; the floor-level sill is on the wall base and is
    // not lined: (width + 2 * height) * thickness.
    const expectedReveal = (VOID_WIDTH + 2 * VOID_HEIGHT) * THICKNESS // 595_680
    expect(Math.abs(roleArea(mesh, 'reveal') - expectedReveal)).toBeLessThan(AREA_TOLERANCE)
  })

  it('lines all four edges of a raised-sill window void, including the sill', () => {
    const windowWidth = 900
    const windowHeight = 1200
    const mesh = singleWallMesh([
      centeredOpening({
        id: 'opening:w1',
        type: 'double-hung-window',
        width: windowWidth,
        height: windowHeight,
        sillHeight: 900,
      }),
    ])
    expect(mesh).toBeDefined()
    if (mesh === undefined) return

    // A raised sill is lined too: (2 * width + 2 * height) * thickness.
    const expectedReveal = (2 * windowWidth + 2 * windowHeight) * THICKNESS // 504_000
    expect(Math.abs(roleArea(mesh, 'reveal') - expectedReveal)).toBeLessThan(AREA_TOLERANCE)
  })
})
