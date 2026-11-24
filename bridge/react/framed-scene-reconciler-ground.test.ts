import { describe, it, expect, vi } from 'vitest'
import { createFramedSceneReconciler } from './framed-scene-reconciler'
import { Texture, findByEntityId } from '../../engine/testing'
import { groundPlaneDrawsWith, isGroundPlane, markCacheHeld } from '../../engine'
import type { SceneRoot, TextureAppearance } from '../../engine'
import type { SceneGraph, SceneNode, SurfaceTreatment } from '../../core'

const TILE_MM = 2000
const WALL_LENGTH_MM = 2000
const MOVED_WALL_LENGTH_MM = 3000
const WALL_THICKNESS_MM = 120
const WALL_HEIGHT_MM = 2400

const floorNode = (): SceneNode => ({ id: 'floor:g', kind: 'floor', name: 'Ground', elevation: 0 })

function graphWithWall(floor: SceneNode, wallLength: number): SceneGraph {
  return {
    nodes: [floor],
    walls: [
      {
        id: 'wall:g1',
        kind: 'wall',
        floorId: 'g',
        start: { x: 0, y: 0 },
        end: { x: wallLength, y: 0 },
        thickness: WALL_THICKNESS_MM,
        height: WALL_HEIGHT_MM,
      },
    ],
    rooms: [],
    underlays: [],
    openings: [],
    dimensions: [],
    stairs: [],
    furniture: [],
  }
}

function heldAppearance(): { appearance: TextureAppearance; dispose: ReturnType<typeof vi.fn> } {
  const texture = new Texture()
  const dispose = vi.fn()
  texture.dispose = dispose
  markCacheHeld(texture)
  return { appearance: { texture, tileSize: { width: TILE_MM, height: TILE_MM } }, dispose }
}

function onlyPlane(root: SceneRoot) {
  const planes = root.children.filter((child) => isGroundPlane(child))
  const [plane] = planes
  if (planes.length !== 1 || !plane)
    throw new Error(`expected one ground plane, got ${planes.length}`)
  return plane
}

const paintWithOneObject = (): Record<string, SurfaceTreatment> => ({})

describe('a ground appearance reaches the ground of a stacked scene', () => {
  it('lets an unchanged scene take it in place', () => {
    const reconciler = createFramedSceneReconciler()
    const graph = graphWithWall(floorNode(), WALL_LENGTH_MM)
    const paint = paintWithOneObject()
    const { appearance } = heldAppearance()
    const first = reconciler.reconcile(graph, paint)
    const wallGroup = findByEntityId(first.root, 'wall:g1')

    reconciler.setGroundAppearance(appearance)
    const second = reconciler.reconcile(graph, paint)

    expect(second).toBe(first)
    expect(findByEntityId(second.root, 'wall:g1')).toBe(wallGroup)
    expect(groundPlaneDrawsWith(onlyPlane(second.root), appearance)).toBe(true)
  })

  it('seats a rebuilt floor set on it', () => {
    const reconciler = createFramedSceneReconciler()
    const paint = paintWithOneObject()
    const { appearance } = heldAppearance()
    reconciler.reconcile(graphWithWall(floorNode(), WALL_LENGTH_MM), paint)
    reconciler.setGroundAppearance(appearance)

    const moved = reconciler.reconcile(graphWithWall(floorNode(), MOVED_WALL_LENGTH_MM), paint)

    expect(groundPlaneDrawsWith(onlyPlane(moved.root), appearance)).toBe(true)
  })

  it('gives the flat lawn back when it is taken away, and never frees a held texture', () => {
    const reconciler = createFramedSceneReconciler()
    const paint = paintWithOneObject()
    const moved = graphWithWall(floorNode(), MOVED_WALL_LENGTH_MM)
    const { appearance, dispose } = heldAppearance()
    reconciler.setGroundAppearance(appearance)
    reconciler.reconcile(moved, paint)

    reconciler.setGroundAppearance(undefined)
    const flat = reconciler.reconcile(moved, paint)
    reconciler.releaseRetired(flat)

    expect(groundPlaneDrawsWith(onlyPlane(flat.root), undefined)).toBe(true)
    expect(dispose).not.toHaveBeenCalled()
  })
})
