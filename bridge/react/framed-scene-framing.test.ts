import { describe, it, expect } from 'vitest'
import { FLOOR_NODE_PREFIX, frameSceneCamera, sceneGraphForFloor } from '../../core'
import type { Bounds3, SceneGraph, SceneNode } from '../../core'
import { createFramedSceneReconciler } from './framed-scene-reconciler'

const WALL_THICKNESS_MM = 120
const WALL_HEIGHT_MM = 2400
const GROUND_WALL_LENGTH_MM = 6000
const UPPER_WALL_LENGTH_MM = 2000
const UPPER_FLOOR_ELEVATION_MM = 2700
const PRECISION = 6

const floorNode = (id: string, elevation: number): SceneNode => ({
  id: `${FLOOR_NODE_PREFIX}${id}`,
  kind: 'floor',
  name: id,
  elevation,
})

function floorWall(floorId: string, length: number): SceneGraph['walls'][number] {
  return {
    id: `wall:${floorId}1`,
    kind: 'wall',
    floorId,
    start: { x: 0, y: 0 },
    end: { x: length, y: 0 },
    thickness: WALL_THICKNESS_MM,
    height: WALL_HEIGHT_MM,
  }
}

function graphOf(nodes: SceneNode[], walls: SceneGraph['walls']): SceneGraph {
  return {
    nodes,
    walls,
    rooms: [],
    underlays: [],
    openings: [],
    dimensions: [],
    stairs: [],
    furniture: [],
  }
}

const twoFloors = (): SceneGraph =>
  graphOf(
    [floorNode('g', 0), floorNode('u', UPPER_FLOOR_ELEVATION_MM)],
    [floorWall('g', GROUND_WALL_LENGTH_MM), floorWall('u', UPPER_WALL_LENGTH_MM)],
  )

const emptyGraph = (): SceneGraph => graphOf([], [])

function boxOf(box: Bounds3 | null): Bounds3 {
  if (box === null) throw new Error('expected a box, got null')
  return box
}

type Point3 = Bounds3['min']

function expectPointClose(actual: Point3, expected: Point3): void {
  expect(actual.x).toBeCloseTo(expected.x, PRECISION)
  expect(actual.y).toBeCloseTo(expected.y, PRECISION)
  expect(actual.z).toBeCloseTo(expected.z, PRECISION)
}

function expectBoxClose(actual: Bounds3 | null, expected: Bounds3 | null): void {
  expectPointClose(boxOf(actual).min, boxOf(expected).min)
  expectPointClose(boxOf(actual).max, boxOf(expected).max)
}

function corners(box: Bounds3): Point3[] {
  const { min, max } = box
  return [min.x, max.x].flatMap((x) =>
    [min.y, max.y].flatMap((y) => [min.z, max.z].map((z) => ({ x, y, z }))),
  )
}

describe('the framed scene of a graph that names a framed floor', () => {
  it.each(['u', 'g'])('frames floor %s alone in a scene that draws both floors', (id) => {
    const framed = createFramedSceneReconciler().reconcile({ ...twoFloors(), framedFloorId: id })
    const alone = createFramedSceneReconciler().reconcile(sceneGraphForFloor(twoFloors(), id))
    const building = createFramedSceneReconciler().reconcile(twoFloors())

    expectBoxClose(framed.framingBounds, alone.bounds)
    expectBoxClose(framed.bounds, building.bounds)
    expectPointClose(framed.pose.position, alone.pose.position)
    expectPointClose(framed.pose.target, alone.pose.target)
    expect(framed.pose.near).toBeCloseTo(building.pose.near, PRECISION)
    expect(framed.pose.far).toBeCloseTo(building.pose.far, PRECISION)
  })

  it('still draws the floors below the framed floor', () => {
    const framed = createFramedSceneReconciler().reconcile({ ...twoFloors(), framedFloorId: 'u' })

    expect(boxOf(framed.bounds).min.y).toBeLessThan(UPPER_FLOOR_ELEVATION_MM)
    expect(boxOf(framed.framingBounds).min.y).toBeGreaterThanOrEqual(UPPER_FLOOR_ELEVATION_MM)
  })

  it('reaches every corner of the drawn box with the far plane', () => {
    const framed = createFramedSceneReconciler().reconcile({ ...twoFloors(), framedFloorId: 'u' })
    const alone = createFramedSceneReconciler().reconcile(sceneGraphForFloor(twoFloors(), 'u'))
    const { position } = framed.pose

    for (const corner of corners(boxOf(framed.bounds))) {
      const distance = Math.hypot(
        corner.x - position.x,
        corner.y - position.y,
        corner.z - position.z,
      )
      expect(distance).toBeLessThan(framed.pose.far)
    }
    expect(framed.pose.far).toBeGreaterThan(alone.pose.far)
  })

  it('frames every drawn floor when the graph names no floor', () => {
    const building = createFramedSceneReconciler().reconcile(twoFloors())

    expect(building.framingBounds).toEqual(building.bounds)
    expect(building.pose).toEqual(frameSceneCamera(boxOf(building.bounds)))
  })

  it('frames every drawn floor when the framed floor has no built content', () => {
    const graph = graphOf(
      [floorNode('g', 0), floorNode('u', UPPER_FLOOR_ELEVATION_MM)],
      [floorWall('g', GROUND_WALL_LENGTH_MM)],
    )

    const framed = createFramedSceneReconciler().reconcile({ ...graph, framedFloorId: 'u' })

    expect(framed.framingBounds).toEqual(framed.bounds)
    expect(framed.pose).toEqual(frameSceneCamera(boxOf(framed.bounds)))
  })

  it('frames every drawn floor when the framed floor is not in the graph', () => {
    const framed = createFramedSceneReconciler().reconcile({ ...twoFloors(), framedFloorId: 'x' })

    expect(framed.framingBounds).toEqual(framed.bounds)
  })

  it('has no framing box for a graph with no floors', () => {
    const framed = createFramedSceneReconciler().reconcile({ ...emptyGraph(), framedFloorId: 'g' })

    expect(framed.framingBounds).toBeNull()
    expect(framed.bounds).toBeNull()
  })
})

describe('the scene cache of a reconciler that is asked to frame different floors', () => {
  it('reframes when the same floors are reconciled without a framed floor', () => {
    const reconciler = createFramedSceneReconciler()
    const graph = twoFloors()

    const first = reconciler.reconcile({ ...graph, framedFloorId: 'u' })
    const second = reconciler.reconcile({ ...graph })

    expect(second.framingBounds).toEqual(second.bounds)
    expect(second).not.toBe(first)
  })

  it('reframes when the framed floor changes', () => {
    const reconciler = createFramedSceneReconciler()
    const graph = twoFloors()

    const upper = reconciler.reconcile({ ...graph, framedFloorId: 'u' })
    const ground = reconciler.reconcile({ ...graph, framedFloorId: 'g' })

    expect(boxOf(ground.framingBounds).max.y).toBeLessThan(boxOf(upper.framingBounds).min.y)
  })

  it('returns the cached scene for the same floors and framed floor', () => {
    const reconciler = createFramedSceneReconciler()
    const graph = twoFloors()

    const first = reconciler.reconcile({ ...graph, framedFloorId: 'u' })
    const second = reconciler.reconcile({ ...graph, framedFloorId: 'u' })

    expect(second).toBe(first)
  })
})
