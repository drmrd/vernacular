import { describe, it, expect, afterEach } from 'vitest'
import { renderHook, cleanup } from '@testing-library/react'

import type { SceneGraph } from '../../core'
import { groundPlaneDrawsWith, isGroundPlane, markCacheHeld } from '../../engine'
import type { SceneRoot, TextureAppearance } from '../../engine'
import { Texture, findByEntityId } from '../../engine/testing'
import { buildFramedScene } from './framed-scene'
import { useHarnessGround } from './harness-ground'
import type { TextureState, TextureStatus } from './texture-cache'

afterEach(cleanup)

const TILE_MM = 2000
const GRADE_MM = 0
const WALL_LENGTH_MM = 2000
const WALL_THICKNESS_MM = 120
const WALL_HEIGHT_MM = 2400

const graph: SceneGraph = {
  nodes: [{ id: 'floor:g', kind: 'floor', name: 'Ground', elevation: 0 }],
  walls: [
    {
      id: 'wall:g1',
      kind: 'wall',
      floorId: 'g',
      start: { x: 0, y: 0 },
      end: { x: WALL_LENGTH_MM, y: 0 },
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

function heldAppearance(): TextureAppearance {
  const texture = new Texture()
  markCacheHeld(texture)
  return { texture, tileSize: { width: TILE_MM, height: TILE_MM } }
}

function onlyPlane(root: SceneRoot) {
  const planes = root.children.filter((child) => isGroundPlane(child))
  const [plane] = planes
  if (planes.length !== 1 || !plane)
    throw new Error(`expected one ground plane, got ${planes.length}`)
  return plane
}

interface HarnessRender {
  status: TextureStatus
  drawsGrass: boolean
}

interface HarnessProps {
  root: SceneRoot
  texture: TextureState
}

function recordHarnessGround(appearance: TextureAppearance, first: HarnessProps) {
  const renders: HarnessRender[] = []
  const hook = renderHook(
    ({ root, texture }: HarnessProps) => {
      const status = useHarnessGround(root, GRADE_MM, texture)
      renders.push({ status, drawsGrass: groundPlaneDrawsWith(onlyPlane(root), appearance) })
      return status
    },
    { initialProps: first, reactStrictMode: true },
  )
  return { ...hook, renders }
}

function readyRenders(renders: HarnessRender[]) {
  return renders.filter((render) => render.status === 'ready')
}

describe('the harness ground reports loading until the grass is on the plane, then ready, and rebuilds no other geometry', () => {
  it('turns ready only after the plane draws the grass, and keeps the walls', () => {
    const appearance = heldAppearance()
    const ready: TextureState = { status: 'ready', appearance }
    const { root } = buildFramedScene(graph)
    const wall = findByEntityId(root, 'wall:g1')
    const { renders, rerender, result } = recordHarnessGround(appearance, {
      root,
      texture: { status: 'loading' },
    })
    const arrival = renders.length

    rerender({ root, texture: ready })

    const sinceArrival = renders.slice(arrival)
    expect(sinceArrival[0]).toEqual({ status: 'loading', drawsGrass: false })
    expect(sinceArrival.at(-1)).toEqual({ status: 'ready', drawsGrass: true })
    expect(readyRenders(sinceArrival).every((render) => render.drawsGrass)).toBe(true)
    expect(result.current).toBe('ready')
    expect(groundPlaneDrawsWith(onlyPlane(root), appearance)).toBe(true)
    expect(findByEntityId(root, 'wall:g1')).toBe(wall)
  })

  it('reports loading for a new root until the grass is on its plane', () => {
    const appearance = heldAppearance()
    const ready: TextureState = { status: 'ready', appearance }
    const { renders, rerender, result } = recordHarnessGround(appearance, {
      root: buildFramedScene(graph).root,
      texture: ready,
    })
    const second = buildFramedScene(graph).root
    const swap = renders.length

    rerender({ root: second, texture: ready })

    const sinceSwap = renders.slice(swap)
    expect(sinceSwap[0]).toEqual({ status: 'loading', drawsGrass: false })
    expect(sinceSwap.at(-1)).toEqual({ status: 'ready', drawsGrass: true })
    expect(readyRenders(sinceSwap).every((render) => render.drawsGrass)).toBe(true)
    expect(result.current).toBe('ready')
    expect(groundPlaneDrawsWith(onlyPlane(second), appearance)).toBe(true)
  })

  it('reports failed after loading and leaves the flat plane', () => {
    const { root } = buildFramedScene(graph)
    const appearance = heldAppearance()
    const loading: TextureState = { status: 'loading' }
    const failed: TextureState = { status: 'failed' }
    const { renders, rerender, result } = recordHarnessGround(appearance, {
      root,
      texture: loading,
    })
    const arrival = renders.length

    rerender({ root, texture: failed })

    const sinceArrival = renders.slice(arrival)
    expect(renders[0]).toEqual({ status: 'loading', drawsGrass: false })
    expect(sinceArrival.at(-1)).toEqual({ status: 'failed', drawsGrass: false })
    expect(result.current).toBe('failed')
    expect(groundPlaneDrawsWith(onlyPlane(root), undefined)).toBe(true)
  })
})
