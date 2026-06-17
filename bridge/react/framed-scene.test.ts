/* eslint-disable max-lines --
 * A behavior-organized suite whose cases each own a self-contained SceneGraph
 * literal (now seeding the required `furniture` array). The file length tracks
 * the number of framed-scene cases, not any single hard-to-read unit. */
import { describe, it, expect } from 'vitest'
import { buildFramedScene } from './framed-scene'
import { findByEntityId } from '../../engine/testing'
import { updateNearWallTransparency } from '../../engine'
import { DEFAULT_CAMERA_POSE, colorFromHex, solidTreatment, surfaceKey } from '../../core'
import type { RoomSceneNode, SceneGraph } from '../../core'

// A square room whose south wall hosts a double-hung window. The wall scene-node
// ids carry the `wall:` prefix; the window's hostWallId is the raw id ('s'), the
// real convention a derived graph produces.
function squareRoomWithSouthWindow(ceiling: number): SceneGraph {
  const span = 4000
  const thickness = 200
  return {
    nodes: [{ id: 'floor:g', kind: 'floor', name: 'G', elevation: 0 }],
    walls: [
      {
        id: 'wall:s',
        kind: 'wall',
        floorId: 'g',
        start: { x: 0, y: 0 },
        end: { x: span, y: 0 },
        thickness,
        height: ceiling,
      },
      {
        id: 'wall:e',
        kind: 'wall',
        floorId: 'g',
        start: { x: span, y: 0 },
        end: { x: span, y: span },
        thickness,
        height: ceiling,
      },
      {
        id: 'wall:n',
        kind: 'wall',
        floorId: 'g',
        start: { x: span, y: span },
        end: { x: 0, y: span },
        thickness,
        height: ceiling,
      },
      {
        id: 'wall:w',
        kind: 'wall',
        floorId: 'g',
        start: { x: 0, y: span },
        end: { x: 0, y: 0 },
        thickness,
        height: ceiling,
      },
    ],
    rooms: [
      {
        id: 'room:r',
        kind: 'room',
        floorId: 'g',
        polygon: [
          { x: 0, y: 0 },
          { x: span, y: 0 },
          { x: span, y: span },
          { x: 0, y: span },
        ],
        clearPolygon: [
          { x: 0, y: 0 },
          { x: span, y: 0 },
          { x: span, y: span },
          { x: 0, y: span },
        ],
        area: span * span,
        ceilingHeight: ceiling,
      },
    ],
    underlays: [],
    openings: [
      {
        id: 'opening:window',
        kind: 'opening',
        floorId: 'g',
        type: 'double-hung-window',
        center: { x: 2000, y: 0 },
        along: { x: 1, y: 0 },
        normal: { x: 0, y: 1 },
        width: 900,
        height: 1200,
        sillHeight: 900,
        hostThickness: thickness,
        orientation: { hinge: 'start', facing: 'positive' },
        hostWallId: 's',
      },
    ],
    dimensions: [],
    stairs: [],
    furniture: [],
  }
}

// Reads the opacity of the 'glass' material under a built opening group,
// structurally so the bridge test does not import three.
function glassOpacityOf(group: unknown): number | undefined {
  let opacity: number | undefined
  ;(group as { traverse(cb: (object: unknown) => void): void }).traverse((object) => {
    const mesh = object as { material?: { name?: string; opacity?: number } }
    if (
      mesh.material !== undefined &&
      !Array.isArray(mesh.material) &&
      mesh.material.name === 'glass'
    ) {
      opacity = mesh.material.opacity
    }
  })
  return opacity
}

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
    furniture: [],
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
      furniture: [],
    }

    const { pose } = buildFramedScene(graph)

    // DEFAULT_CAMERA_POSE carries finite, non-NaN near/far, so this equality also
    // guards the empty-scene regression: an Infinity-valued bounds would frame to a
    // NaN pose that could never equal the fixed default.
    expect(pose).toEqual(DEFAULT_CAMERA_POSE)
  })

  it('prepares the exterior walls of a room for near-wall transparency', () => {
    const roomGraph: SceneGraph = {
      nodes: [{ id: 'floor:g', kind: 'floor', name: 'G', elevation: 0 }],
      walls: [
        {
          id: 'wall:s',
          kind: 'wall',
          floorId: 'g',
          start: { x: 0, y: 0 },
          end: { x: 4000, y: 0 },
          thickness: 200,
          height,
        },
        {
          id: 'wall:e',
          kind: 'wall',
          floorId: 'g',
          start: { x: 4000, y: 0 },
          end: { x: 4000, y: 4000 },
          thickness: 200,
          height,
        },
        {
          id: 'wall:n',
          kind: 'wall',
          floorId: 'g',
          start: { x: 4000, y: 4000 },
          end: { x: 0, y: 4000 },
          thickness: 200,
          height,
        },
        {
          id: 'wall:w',
          kind: 'wall',
          floorId: 'g',
          start: { x: 0, y: 4000 },
          end: { x: 0, y: 0 },
          thickness: 200,
          height,
        },
      ],
      rooms: [
        {
          id: 'room:r',
          kind: 'room',
          floorId: 'g',
          polygon: [
            { x: 0, y: 0 },
            { x: 4000, y: 0 },
            { x: 4000, y: 4000 },
            { x: 0, y: 4000 },
          ],
          clearPolygon: [
            { x: 0, y: 0 },
            { x: 4000, y: 0 },
            { x: 4000, y: 4000 },
            { x: 0, y: 4000 },
          ],
          area: 4000 * 4000,
          ceilingHeight: height,
        },
      ],
      underlays: [],
      openings: [],
      dimensions: [],
      stairs: [],
      furniture: [],
    }

    // All four walls of the single room are exterior, so the build prepares one
    // near-wall-transparency target per wall.
    expect(buildFramedScene(roomGraph).nearWallTargets).toHaveLength(4)
  })

  it('folds an opening on an exterior wall into its wall fade target', () => {
    const fadedOpacity = 0.1
    const { root, nearWallTargets } = buildFramedScene(squareRoomWithSouthWindow(height))

    // Camera outside the south wall (world z < 0): it fades, and its window with it.
    updateNearWallTransparency(nearWallTargets, { x: 2000, z: -3000 })

    const group = findByEntityId(root, 'opening:window')
    expect(group).not.toBeNull()
    expect(glassOpacityOf(group)).toBe(fadedOpacity)
  })

  it('paints a room floor from the supplied paint store', () => {
    const floorId = 'g'
    const room: RoomSceneNode = {
      id: 'room:r1',
      kind: 'room',
      floorId,
      polygon: [
        { x: 0, y: 0 },
        { x: 2000, y: 0 },
        { x: 2000, y: 2000 },
        { x: 0, y: 2000 },
      ],
      clearPolygon: [
        { x: 60, y: 60 },
        { x: 1940, y: 60 },
        { x: 1940, y: 1940 },
        { x: 60, y: 1940 },
      ],
      area: 1880 * 1880,
      ceilingHeight: 2400,
    }
    const paintedGraph: SceneGraph = {
      nodes: [{ id: 'floor:g', kind: 'floor', name: 'G', elevation: 0 }],
      walls: [],
      rooms: [room],
      underlays: [],
      openings: [],
      dimensions: [],
      stairs: [],
      furniture: [],
    }
    const hex = '#aa5500'
    const ref = { kind: 'floor', floorId } as const
    const paint = { [surfaceKey(ref)]: solidTreatment(colorFromHex(hex), 'matte') }

    const { root } = buildFramedScene(paintedGraph, paint)

    let topHex: string | undefined
    root.traverse((object) => {
      const mesh = object as unknown as { material?: unknown }
      if (Array.isArray(mesh.material)) {
        const top = (mesh.material as { name: string; color: { getHexString(): string } }[]).find(
          (material) => material.name === 'top',
        )
        if (top !== undefined) {
          topHex = top.color.getHexString()
        }
      }
    })
    expect(topHex).toBe('aa5500')
  })
})
