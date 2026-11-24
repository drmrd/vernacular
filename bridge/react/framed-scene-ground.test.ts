import { describe, it, expect, vi } from 'vitest'
import { buildFramedScene, refreshGroundPlane } from './framed-scene'
import { createFramedSceneReconciler } from './framed-scene-reconciler'
import { Texture } from '../../engine/testing'
import { groundPlaneDrawsWith, isGroundPlane, markCacheHeld } from '../../engine'
import type { SceneRoot, TextureAppearance } from '../../engine'
import type { SceneGraph, SurfaceTreatment } from '../../core'

const TILE_MM = 2000
const SMALLER_TILE_MM = 1000
const RAISED_GRADE_MM = 300

const graph: SceneGraph = {
  nodes: [{ id: 'floor:g', kind: 'floor', name: 'Ground', elevation: 0 }],
  walls: [],
  rooms: [],
  underlays: [],
  openings: [],
  dimensions: [],
  stairs: [],
  furniture: [],
}

function heldTexture(): { texture: Texture; dispose: ReturnType<typeof vi.fn> } {
  const texture = new Texture()
  const dispose = vi.fn()
  texture.dispose = dispose
  markCacheHeld(texture)
  return { texture, dispose }
}

function appearanceOf(texture: Texture, tile = TILE_MM): TextureAppearance {
  return { texture, tileSize: { width: tile, height: tile } }
}

function planesOn(root: SceneRoot) {
  return root.children.filter((child) => isGroundPlane(child))
}

function onlyPlane(root: SceneRoot) {
  const planes = planesOn(root)
  const [plane] = planes
  if (planes.length !== 1 || !plane)
    throw new Error(`expected one ground plane, got ${planes.length}`)
  return plane
}

describe('buildFramedScene ground appearance', () => {
  it('draws the ground with the appearance in its view options', () => {
    const appearance = appearanceOf(heldTexture().texture)

    const { root } = buildFramedScene(graph, {}, { groundAppearance: appearance })

    const [plane] = planesOn(root)
    expect(plane && groundPlaneDrawsWith(plane, appearance)).toBe(true)
  })
})

describe('refreshGroundPlane with a textured ground', () => {
  it('swaps the flat plane for one that draws with the appearance', () => {
    const { root } = buildFramedScene(graph)
    const appearance = appearanceOf(heldTexture().texture)

    refreshGroundPlane(root, { gradeElevation: 0, appearance })

    expect(groundPlaneDrawsWith(onlyPlane(root), appearance)).toBe(true)
  })

  it('keeps a plane that already draws with the same ground', () => {
    const { root } = buildFramedScene(graph)
    const appearance = appearanceOf(heldTexture().texture)
    refreshGroundPlane(root, { gradeElevation: 0, appearance })
    const [first] = planesOn(root)

    refreshGroundPlane(root, { gradeElevation: 0, appearance })

    expect(planesOn(root)).toHaveLength(1)
    expect(planesOn(root)[0]).toBe(first)
  })

  it('seats a new textured plane at a changed grade', () => {
    const { root } = buildFramedScene(graph)
    const appearance = appearanceOf(heldTexture().texture)
    refreshGroundPlane(root, { gradeElevation: 0, appearance })
    const [first] = planesOn(root)

    refreshGroundPlane(root, { gradeElevation: RAISED_GRADE_MM, appearance })

    const plane = onlyPlane(root)
    expect(plane).not.toBe(first)
    expect(plane.position.y).toBe(RAISED_GRADE_MM)
    expect(groundPlaneDrawsWith(plane, appearance)).toBe(true)
  })

  it('replaces the plane when only the tile size changes', () => {
    const { root } = buildFramedScene(graph)
    const { texture } = heldTexture()
    refreshGroundPlane(root, { gradeElevation: 0, appearance: appearanceOf(texture) })
    const [first] = planesOn(root)
    const smaller = appearanceOf(texture, SMALLER_TILE_MM)

    refreshGroundPlane(root, { gradeElevation: 0, appearance: smaller })

    const plane = onlyPlane(root)
    expect(plane).not.toBe(first)
    expect(groundPlaneDrawsWith(plane, smaller)).toBe(true)
  })

  it('gives a flat plane again when the appearance is taken away', () => {
    const { root } = buildFramedScene(graph)
    refreshGroundPlane(root, { gradeElevation: 0, appearance: appearanceOf(heldTexture().texture) })

    refreshGroundPlane(root, { gradeElevation: 0, appearance: undefined })

    expect(groundPlaneDrawsWith(onlyPlane(root), undefined)).toBe(true)
  })

  it('never frees a held texture while swapping planes', () => {
    const { root } = buildFramedScene(graph)
    const { texture, dispose } = heldTexture()

    refreshGroundPlane(root, { gradeElevation: 0, appearance: appearanceOf(texture) })
    refreshGroundPlane(root, { gradeElevation: RAISED_GRADE_MM, appearance: appearanceOf(texture) })
    refreshGroundPlane(root, { gradeElevation: 0, appearance: undefined })

    expect(dispose).not.toHaveBeenCalled()
  })
})

describe('a reconciled scene ground', () => {
  it('sits flat at the grade after a rebuild and again on a cache hit', () => {
    const reconciler = createFramedSceneReconciler()
    const raised: SceneGraph = { ...graph, gradeElevation: RAISED_GRADE_MM }
    const paint: Record<string, SurfaceTreatment> = {}

    const first = reconciler.reconcile(raised, paint)
    const built = onlyPlane(first.root)
    expect(built.position.y).toBe(RAISED_GRADE_MM)
    expect(groundPlaneDrawsWith(built, undefined)).toBe(true)

    const second = reconciler.reconcile(raised, paint)
    expect(second).toBe(first)
    expect(onlyPlane(second.root).position.y).toBe(RAISED_GRADE_MM)
  })
})
