import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildJunctionFill } from './junction-fill-builder'
import { NeutralMaterialProvider } from '../materials/neutral-material-provider'
import { materialGroups, readNormals, readPositions } from '../testing'
import type { JunctionFill, Point } from '../../core'

const HEIGHT = 2600
const FLOOR_DATUM_Y = 0
const UP_THRESHOLD = 0.99
const FLAT_THRESHOLD = 0.01
const TOLERANCE = 1e-6

// The T-junction core triangle: the resolved footprint corners the three walls
// stop at, in plan space (plan x, plan y). buildJunctionFill extrudes this into a
// vertical prism from world Y = 0 up to the height.
const CORE_TRIANGLE: Point[] = [
  { x: 1050, y: 50 },
  { x: 950, y: 50 },
  { x: 1000, y: -50 },
]

function tJunctionFill(): JunctionFill {
  return { polygon: CORE_TRIANGLE, edgeIndexes: [0, 1, 2] }
}

function fillWithEdges(edgeIndexes: number[]): JunctionFill {
  return { polygon: CORE_TRIANGLE, edgeIndexes }
}

describe('buildJunctionFill', () => {
  it('extrudes the core polygon into a vertical neutral prism with no entity id', () => {
    const mesh = buildJunctionFill(tJunctionFill(), HEIGHT, new NeutralMaterialProvider())

    expect(mesh).toBeInstanceOf(THREE.Mesh)
    expect(Array.isArray(mesh.material)).toBe(true)

    const geometry = mesh.geometry
    const materials = mesh.material as THREE.Material[]
    const groups = materialGroups(geometry)
    const normals = readNormals(geometry)
    const positions = readPositions(geometry)

    // The drawn roles are exactly the top cap, the base cap, and the side faces.
    const drawnRoles = new Set(groups.map((g) => materials[g.materialIndex]?.name))
    expect([...drawnRoles].sort()).toEqual(['base', 'junction', 'top'])

    const group = (role: string) => groups.find((g) => materials[g.materialIndex]?.name === role)

    // The caps wind so the top faces up and the base faces down; a side stands
    // vertical (its first-vertex normal is horizontal).
    const topGroup = group('top')
    const baseGroup = group('base')
    const sideGroup = group('junction')
    expect(topGroup).toBeDefined()
    expect(baseGroup).toBeDefined()
    expect(sideGroup).toBeDefined()
    const top = topGroup as { start: number; count: number }
    const base = baseGroup as { start: number; count: number }
    const side = sideGroup as { start: number; count: number }

    expect(normals[top.start]?.y ?? 0).toBeGreaterThan(UP_THRESHOLD)
    expect(normals[base.start]?.y ?? 0).toBeLessThan(-UP_THRESHOLD)
    expect(Math.abs(normals[side.start]?.y ?? 1)).toBeLessThan(FLAT_THRESHOLD)

    // The prism rises from the floor datum to the height: the top cap sits at the
    // height and the base cap on the datum.
    const topVertices = positions.slice(top.start, top.start + top.count)
    const baseVertices = positions.slice(base.start, base.start + base.count)
    expect(topVertices.length).toBeGreaterThan(0)
    expect(baseVertices.length).toBeGreaterThan(0)
    expect(topVertices.every((v) => v.y === HEIGHT)).toBe(true)
    expect(baseVertices.every((v) => v.y === FLOOR_DATUM_Y)).toBe(true)

    // Every plan corner maps onto the top cap through planToWorld(point, h) =
    // { x: point.x, y: h, z: point.y }: plan x -> world X, plan y -> world Z.
    for (const corner of CORE_TRIANGLE) {
      const present = topVertices.some(
        (v) => Math.abs(v.x - corner.x) < TOLERANCE && Math.abs(v.z - corner.y) < TOLERANCE,
      )
      expect(present).toBe(true)
    }

    // A junction is not an entity in the model, so the fill mesh carries no id.
    expect(mesh.userData.entityId).toBeUndefined()
  })

  it('tags the fill mesh with a stable junction key derived from its edge indexes, without an entity id', () => {
    const mesh = buildJunctionFill(fillWithEdges([3, 7, 2]), HEIGHT, new NeutralMaterialProvider())

    // The fade pass needs to address the fill without making it pickable. A junction
    // is not an entity (ADR-0082), so the mesh stays free of an entity id ...
    expect(mesh.userData.entityId).toBeUndefined()

    // ... but carries a junction key the fade pass can join to its core group. The
    // key is a defined, non-empty stable identity derived from the fill's edge
    // indexes (the junction's identity in the wall graph).
    const junctionKey = mesh.userData.junctionKey as unknown
    expect(junctionKey).toBeDefined()
    expect(typeof junctionKey).toBe('string')
    expect(junctionKey).not.toBe('')

    // The key is stable: the same junction (same incident edges) yields the same key.
    const sameJunction = buildJunctionFill(
      fillWithEdges([3, 7, 2]),
      HEIGHT,
      new NeutralMaterialProvider(),
    )
    expect(sameJunction.userData.junctionKey).toBe(junctionKey)

    // The key is addressable per junction: a different incident-edge set yields a
    // different key, so two junctions never collide in the fade pass.
    const otherJunction = buildJunctionFill(
      fillWithEdges([4, 8, 1]),
      HEIGHT,
      new NeutralMaterialProvider(),
    )
    expect(otherJunction.userData.junctionKey).not.toBe(junctionKey)
  })
})
