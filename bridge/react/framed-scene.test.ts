import { describe, it, expect } from 'vitest'
import { buildFramedScene } from './framed-scene'
import { findByEntityId } from '../../engine/testing'
import { DEFAULT_CAMERA_POSE } from '../../core'
import type { SceneGraph } from '../../core'

describe('buildFramedScene', () => {
  const wallLength = 2000
  const thickness = 120
  const height = 2400
  const graph: SceneGraph = {
    nodes: [{ id: 'floor:g', kind: 'floor', name: 'Ground', elevation: 0 }],
    walls: [
      {
        id: 'wall:w1',
        kind: 'wall',
        floorId: 'g',
        start: { x: 0, y: 0 },
        end: { x: wallLength, y: 0 },
        thickness,
        height,
      },
    ],
    rooms: [],
    underlays: [],
    openings: [],
    dimensions: [],
    stairs: [],
  }

  it('frames the camera on the world bounds of a scene that has walls', () => {
    const { root, pose } = buildFramedScene(graph)

    // The wall mesh is present in the built scene.
    expect(findByEntityId(root, 'wall:w1')).not.toBeNull()

    // The wall extrudes into a box spanning x in [0, L], y in [0, h],
    // z in [-t/2, t/2]; its center is (L/2, h/2, 0).
    const precision = 3
    expect(pose.target.x).toBeCloseTo(wallLength / 2, precision)
    expect(pose.target.y).toBeCloseTo(height / 2, precision)
    expect(pose.target.z).toBeCloseTo(0, precision)

    // The far plane reaches at least the bounding box's diagonal, so the
    // geometry stays inside the frustum; both planes are finite and positive.
    const diagonal = Math.hypot(wallLength, height, thickness)
    expect(pose.far).toBeGreaterThanOrEqual(diagonal)
    expect(Number.isFinite(pose.near)).toBe(true)
    expect(Number.isFinite(pose.far)).toBe(true)
    expect(pose.near).toBeGreaterThan(0)
    expect(pose.far).toBeGreaterThan(0)

    // The camera is pulled back from the geometry on every axis rather than
    // sitting on the origin.
    expect(pose.position.x).toBeGreaterThan(pose.target.x)
    expect(pose.position.y).toBeGreaterThan(pose.target.y)
    expect(pose.position.z).toBeGreaterThan(pose.target.z)
  })

  it('returns the scene world bounds alongside the framed pose', () => {
    const { bounds } = buildFramedScene(graph)

    expect(bounds).not.toBeNull()
    expect(bounds?.max.x).toBeGreaterThan(bounds?.min.x ?? 0)
  })

  it('marks the shell meshes as shadow casters and receivers', () => {
    const { root } = buildFramedScene(graph)

    // findByEntityId returns the wall mesh; read the shadow flags structurally so the
    // bridge test does not import three.
    const wall = findByEntityId(root, 'wall:w1') as {
      castShadow: boolean
      receiveShadow: boolean
    } | null
    expect(wall?.castShadow).toBe(true)
    expect(wall?.receiveShadow).toBe(true)
  })

  it('returns a finite default pose for a scene with no renderable geometry', () => {
    const graph: SceneGraph = {
      nodes: [{ id: 'floor:g', kind: 'floor', name: 'Ground', elevation: 0 }],
      walls: [],
      rooms: [],
      underlays: [],
      openings: [],
      dimensions: [],
      stairs: [],
    }

    const { pose } = buildFramedScene(graph)

    // DEFAULT_CAMERA_POSE carries finite, non-NaN near/far, so this equality also
    // guards the empty-scene regression: an Infinity-valued bounds would frame to a
    // NaN pose that could never equal the fixed default.
    expect(pose).toEqual(DEFAULT_CAMERA_POSE)
  })
})
