import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import {
  FLOOR_NODE_PREFIX,
  createEmptyProject,
  createFloor,
  createFurnitureInstance,
  createSceneGraphDeriver,
  sceneGraphForFloor,
} from '../../core'
import type { Floor, Project } from '../../core'
import { isGroundPlane, parseFurnitureModel } from '../../engine'
import { findByEntityId } from '../../engine/testing'
import type { Object3D } from '../../engine/testing'
import {
  expectEachDisposedOnce,
  expectNoneDisposed,
  trackResources,
  without,
  type ResourceTracker,
} from './dispose-tracking-test-support'
import type { FurnitureModelLookup } from './floor-build'
import { RIGHT_MM, WIDENED_RIGHT_MM, partitionedWalls } from './partitioned-floor-test-support'
import { createFramedSceneReconciler } from './framed-scene-reconciler'

// dispose() ends a reconciler's life: it must free every geometry and material the reconciler
// still holds (cached scenes, builds, ground planes, and the retired queue) exactly once, and
// leave alone what a long-lived owner holds, here a parsed model template shared by clones.

const CUBE_GLB = resolve(dirname(fileURLToPath(import.meta.url)), '../../e2e/fixtures/cube.glb')
const FLOOR_ID = 'g'
const FLOOR_NODE_ID = `${FLOOR_NODE_PREFIX}${FLOOR_ID}`
const UPPER_ELEVATION_MM = 3000
const CHAIR_HASH = 'c'
const CHAIR_SIZE_MM = 500
const CHAIR_HEIGHT_MM = 900
const CHAIR_POSITION_MM = { x: 1000, y: 1000 }

const emptyPaint = (): Record<string, never> => ({})

function groundFloor(rightX: number): Floor {
  return {
    ...createFloor('Ground', { id: FLOOR_ID, walls: partitionedWalls(rightX, 'g-') }),
    furniture: [
      createFurnitureInstance({
        id: 'chair',
        assetRef: { scope: 'user', contentHash: CHAIR_HASH },
        position: CHAIR_POSITION_MM,
        footprint: { width: CHAIR_SIZE_MM, depth: CHAIR_SIZE_MM },
        height: CHAIR_HEIGHT_MM,
      }),
    ],
  }
}

function upperFloor(): Floor {
  return createFloor('Upper', {
    id: 'u',
    elevation: UPPER_ELEVATION_MM,
    walls: partitionedWalls(RIGHT_MM, 'u-'),
  })
}

function projectOf(ground: Floor): Project {
  const base = createEmptyProject({
    name: 'Dispose all',
    units: 'metric',
    period: 'period',
    appVersion: '0',
  })
  return { ...base, floors: [ground, upperFloor()] }
}

function groupOf(root: Object3D, entityId: string): Object3D {
  const group = findByEntityId(root, entityId)
  if (group === null) {
    throw new Error(`expected the scene to hold a group for ${entityId}`)
  }
  return group
}

function everyTreeResource(trackers: ResourceTracker[], held: ResourceTracker): ResourceTracker {
  const all = trackers.flatMap((tracker) => without(tracker, held).all())
  return { all: () => all, geometries: () => [], materials: () => [] }
}

describe('createFramedSceneReconciler dispose', () => {
  it('frees every resource it holds once, leaves a held model template alone, and is idempotent', async () => {
    const template = await parseFurnitureModel(new Uint8Array(readFileSync(CUBE_GLB)))
    const models: FurnitureModelLookup = {
      get: (hash) => (hash === CHAIR_HASH ? { status: 'ready', template } : undefined),
    }
    const heldTemplate = trackResources(template)
    const derive = createSceneGraphDeriver()
    const reconciler = createFramedSceneReconciler()
    const paint = emptyPaint()
    const trackers: ResourceTracker[] = []

    // A whole-building scene, then a single-floor scene that evicts it, then a room edit whose
    // replaced build waits in the retired queue: dispose runs before any releaseRetired.
    const whole = reconciler.reconcile(derive(projectOf(groundFloor(RIGHT_MM))), paint, models)
    trackers.push(trackResources(whole.root))
    const graphOf = (floor: Floor): ReturnType<typeof sceneGraphForFloor> =>
      sceneGraphForFloor(derive(projectOf(floor)), FLOOR_ID)
    const single = reconciler.reconcile(graphOf(groundFloor(RIGHT_MM)), paint, models)
    trackers.push(trackResources(single.root))
    const retiredFloor = trackResources(groupOf(single.root, FLOOR_NODE_ID))
    const edited = reconciler.reconcile(graphOf(groundFloor(WIDENED_RIGHT_MM)), paint, models)
    trackers.push(trackResources(edited.root))
    expect(heldTemplate.all().length).toBeGreaterThan(0)
    expect(retiredFloor.all().length).toBeGreaterThan(0)
    expect(edited.root.children.some(isGroundPlane)).toBe(true)

    reconciler.dispose()

    const owned = everyTreeResource([...trackers, retiredFloor], heldTemplate)
    expectEachDisposedOnce(owned)
    expectNoneDisposed(heldTemplate)

    reconciler.dispose()

    expectEachDisposedOnce(owned)
    expectNoneDisposed(heldTemplate)
  })
})
