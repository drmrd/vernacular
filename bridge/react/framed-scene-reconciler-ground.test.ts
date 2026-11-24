import { describe, it, expect, vi } from 'vitest'
import { createFramedSceneReconciler } from './framed-scene-reconciler'
import { onlyGroundPlane } from './ground-plane-test-support'
import { ONE_WALL_LENGTH_MM, groundFloorNode, oneWallGraph } from './one-wall-graph-test-support'
import { Mesh, Texture, findByEntityId } from '../../engine/testing'
import { groundPlaneDrawsWith, markCacheHeld } from '../../engine'
import type { TextureAppearance } from '../../engine'
import type { SceneGraph, SceneNode, SurfaceTreatment } from '../../core'
import { emptySceneGraph } from '../../core/scene/scene-graph-test-fixtures'

const TILE_MM = 2000
const MOVED_WALL_LENGTH_MM = 3000
const WALL_ID = 'wall:g1'

const graphWithWall = (floor: SceneNode, length = ONE_WALL_LENGTH_MM): SceneGraph =>
  oneWallGraph(floor, { id: WALL_ID, length })

function heldAppearance(): { appearance: TextureAppearance; dispose: ReturnType<typeof vi.fn> } {
  const texture = new Texture()
  const dispose = vi.fn()
  texture.dispose = dispose
  markCacheHeld(texture)
  return { appearance: { texture, tileSize: { width: TILE_MM, height: TILE_MM } }, dispose }
}

const noPaint = (): Record<string, SurfaceTreatment> => ({})

describe('a ground appearance reaches the ground of a stacked scene', () => {
  it('lets an unchanged scene take it in place', () => {
    const reconciler = createFramedSceneReconciler()
    const graph = graphWithWall(groundFloorNode())
    const paint = noPaint()
    const { appearance } = heldAppearance()
    const first = reconciler.reconcile(graph, paint)
    const wallGroup = findByEntityId(first.root, WALL_ID)

    reconciler.setGroundAppearance(appearance)
    const second = reconciler.reconcile(graph, paint)

    expect(second).toBe(first)
    expect(findByEntityId(second.root, WALL_ID)).toBe(wallGroup)
    expect(groundPlaneDrawsWith(onlyGroundPlane(second.root), appearance)).toBe(true)
  })

  it('seats a rebuilt floor set on it', () => {
    const reconciler = createFramedSceneReconciler()
    const paint = noPaint()
    const { appearance } = heldAppearance()
    reconciler.reconcile(graphWithWall(groundFloorNode()), paint)
    reconciler.setGroundAppearance(appearance)

    const moved = reconciler.reconcile(
      graphWithWall(groundFloorNode(), MOVED_WALL_LENGTH_MM),
      paint,
    )

    expect(groundPlaneDrawsWith(onlyGroundPlane(moved.root), appearance)).toBe(true)
  })

  it('gives the flat lawn back when it is taken away, and never frees a held texture', () => {
    const reconciler = createFramedSceneReconciler()
    const paint = noPaint()
    const { appearance, dispose } = heldAppearance()
    reconciler.setGroundAppearance(appearance)
    reconciler.reconcile(graphWithWall(groundFloorNode()), paint)
    const moved = graphWithWall(groundFloorNode(), MOVED_WALL_LENGTH_MM)
    reconciler.reconcile(moved, paint)

    reconciler.setGroundAppearance(undefined)
    const flat = reconciler.reconcile(moved, paint)
    reconciler.releaseRetired(flat)

    expect(groundPlaneDrawsWith(onlyGroundPlane(flat.root), undefined)).toBe(true)
    expect(dispose).not.toHaveBeenCalled()
  })

  it('dispose frees the ground plane of the scene but never a held ground texture', () => {
    const reconciler = createFramedSceneReconciler()
    const graph = graphWithWall(groundFloorNode())
    const paint = noPaint()
    const { appearance, dispose } = heldAppearance()
    reconciler.reconcile(graph, paint)
    reconciler.setGroundAppearance(appearance)
    const scene = reconciler.reconcile(graph, paint)
    const plane = onlyGroundPlane(scene.root)
    if (!(plane instanceof Mesh) || Array.isArray(plane.material))
      throw new Error('expected a ground plane mesh with one material')
    const planeMaterialDispose = vi.spyOn(plane.material, 'dispose')

    reconciler.dispose()

    expect(planeMaterialDispose).toHaveBeenCalled()
    expect(dispose).not.toHaveBeenCalled()
  })

  it('lets a cached scene of an empty graph take it in place', () => {
    const reconciler = createFramedSceneReconciler()
    const graph = emptySceneGraph()
    const paint = noPaint()
    const { appearance } = heldAppearance()
    const first = reconciler.reconcile(graph, paint)

    reconciler.setGroundAppearance(appearance)
    const second = reconciler.reconcile(graph, paint)

    expect(second).toBe(first)
    expect(groundPlaneDrawsWith(onlyGroundPlane(second.root), appearance)).toBe(true)
  })

  it('seats a new scene of an empty graph on it', () => {
    const reconciler = createFramedSceneReconciler()
    const { appearance } = heldAppearance()
    reconciler.setGroundAppearance(appearance)

    const scene = reconciler.reconcile(emptySceneGraph(), noPaint())

    expect(groundPlaneDrawsWith(onlyGroundPlane(scene.root), appearance)).toBe(true)
  })
})
