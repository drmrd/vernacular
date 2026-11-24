import { describe, it, expect, vi } from 'vitest'
import { buildFramedScene, refreshGroundPlane } from './framed-scene'
import { Texture } from '../../engine/testing'
import { groundPlaneDrawsWith, isGroundPlane, markCacheHeld } from '../../engine'
import type { SceneRoot, TextureAppearance } from '../../engine'
import type { SceneGraph } from '../../core'

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

    const planes = planesOn(root)
    expect(planes).toHaveLength(1)
    expect(groundPlaneDrawsWith(planes[0], appearance)).toBe(true)
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

    const planes = planesOn(root)
    expect(planes).toHaveLength(1)
    expect(planes[0]).not.toBe(first)
    expect(planes[0]?.position.y).toBe(RAISED_GRADE_MM)
    expect(groundPlaneDrawsWith(planes[0], appearance)).toBe(true)
  })

  it('replaces the plane when only the tile size changes', () => {
    const { root } = buildFramedScene(graph)
    const { texture } = heldTexture()
    refreshGroundPlane(root, { gradeElevation: 0, appearance: appearanceOf(texture) })
    const [first] = planesOn(root)
    const smaller = appearanceOf(texture, SMALLER_TILE_MM)

    refreshGroundPlane(root, { gradeElevation: 0, appearance: smaller })

    const planes = planesOn(root)
    expect(planes).toHaveLength(1)
    expect(planes[0]).not.toBe(first)
    expect(groundPlaneDrawsWith(planes[0], smaller)).toBe(true)
  })

  it('gives a flat plane again when the appearance is taken away', () => {
    const { root } = buildFramedScene(graph)
    refreshGroundPlane(root, { gradeElevation: 0, appearance: appearanceOf(heldTexture().texture) })

    refreshGroundPlane(root, { gradeElevation: 0, appearance: undefined })

    const planes = planesOn(root)
    expect(planes).toHaveLength(1)
    expect(groundPlaneDrawsWith(planes[0], undefined)).toBe(true)
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
