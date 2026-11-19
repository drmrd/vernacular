import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Floor, Project, SceneGraph } from '../../core'
import {
  createEmptyProject,
  createFloor,
  createFurnitureInstance,
  createSceneGraphDeriver,
  sceneGraphForFloor,
} from '../../core'
import { parseFurnitureModel } from '../../engine'
import { Mesh, findByEntityId } from '../../engine/testing'
import type { Object3D } from '../../engine/testing'
import { createFurnitureModelCache } from './furniture-model-cache'
import { createFramedSceneReconciler } from './framed-scene-reconciler'

const FLOOR_ID = 'g'
const CHAIR_ID = 'chair-unusable'
const MODEL_HASH = 'unusable-model'
const CHAIR_DIMENSION_MM = 500
const CHAIR_HEIGHT_MM = 900
const CHAIR_POSITION_MM = 1000
/** The glTF attribute name for vertex positions, held as a value so the key keeps its spec casing. */
const POSITION_ATTRIBUTE = 'POSITION'

/** A glTF scene that holds only an empty node: no mesh, so its bounding box is empty. */
const EMPTY_NODES_GLTF = {
  asset: { version: '2.0' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ name: 'empty' }],
}

/** One triangle lying on y = 0, so the model is flat along the y axis. */
function flatTriangleGltf(): object {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1])
  const base64 = Buffer.from(positions.buffer).toString('base64')
  return {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { [POSITION_ATTRIBUTE]: 0 } }] }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: 'VEC3',
        min: [0, 0, 0],
        max: [1, 0, 1],
      },
    ],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength }],
    buffers: [
      {
        byteLength: positions.byteLength,
        uri: `data:application/octet-stream;base64,${base64}`,
      },
    ],
  }
}

function gltfBytes(gltf: object): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(gltf))
}

function chairGraph(): SceneGraph {
  const chair = createFurnitureInstance({
    id: CHAIR_ID,
    assetRef: { scope: 'user', contentHash: MODEL_HASH },
    position: { x: CHAIR_POSITION_MM, y: CHAIR_POSITION_MM },
    footprint: { width: CHAIR_DIMENSION_MM, depth: CHAIR_DIMENSION_MM },
    height: CHAIR_HEIGHT_MM,
  })
  const floor: Floor = { ...createFloor('Ground', { id: FLOOR_ID }), furniture: [chair] }
  const base = createEmptyProject({
    name: 'Unusable geometry',
    units: 'metric',
    period: 'period',
    appVersion: '0',
  })
  const project: Project = { ...base, floors: [floor] }
  return sceneGraphForFloor(createSceneGraphDeriver()(project), FLOOR_ID)
}

function firstMeshMaterialName(group: Object3D): string {
  let mesh: Mesh | undefined
  group.traverse((object) => {
    if (mesh === undefined && object instanceof Mesh) mesh = object
  })
  if (mesh === undefined) throw new Error('expected the furniture group to carry a mesh')
  const material = mesh.material
  return Array.isArray(material) ? (material[0]?.name ?? '') : material.name
}

/** Requests the model through a cache built with the real parser, and waits for it to settle. */
async function loadThroughRealParser(bytes: Uint8Array) {
  const cache = createFurnitureModelCache<Object3D>({
    resolve: async () => bytes,
    parse: parseFurnitureModel,
    dispose: () => {},
  })
  const settled = new Promise<void>((done) => cache.onChange(done))
  cache.request({ scope: 'user', contentHash: MODEL_HASH })
  await settled
  return cache
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('a placed piece whose model has no usable geometry', () => {
  it.each([
    ['a scene with only empty nodes', gltfBytes(EMPTY_NODES_GLTF)],
    ['a model that is flat along one axis', gltfBytes(flatTriangleGltf())],
  ])('shows the failed box for %s', async (_kind, bytes) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const cache = await loadThroughRealParser(bytes)

    expect(cache.get(MODEL_HASH)?.status).toBe('failed')
    expect(warn).toHaveBeenCalledTimes(1)
    const build = createFramedSceneReconciler().reconcile(chairGraph(), {}, cache)
    const group = findByEntityId(build.root, CHAIR_ID)
    if (group === null) throw new Error('expected the placed piece to build a group')
    expect(firstMeshMaterialName(group)).toBe('furnitureFailed')
  })
})
