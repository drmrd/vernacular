import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { SceneGraph } from '../../core'
import { Mesh } from '../../engine/testing'
import type { Object3D } from '../../engine/testing'
import { useFurnitureModelCache } from './use-furniture-model-cache'

const CUBE_GLB = resolve(dirname(fileURLToPath(import.meta.url)), '../../e2e/fixtures/cube.glb')
const MODEL_HASH = 'cube-model'
const CHAIR_HEIGHT_MM = 800

// The hook resolves bytes through the asset registry. Bridge code may not import storage, so
// a stand-in registry that resolves every reference to the cube model replaces the context.
const registryBytes = vi.hoisted(() => ({ cube: new Uint8Array() }))
vi.mock('./asset-registry-context', () => ({
  useAssetRegistry: () => ({
    resolve: async () => ({ outcome: 'resolved', bytes: registryBytes.cube }),
  }),
}))

beforeAll(() => {
  registryBytes.cube = new Uint8Array(readFileSync(CUBE_GLB))
})

const graph: SceneGraph = {
  nodes: [{ id: 'floor:g', kind: 'floor', name: 'Ground', elevation: 0 }],
  walls: [],
  rooms: [],
  underlays: [],
  openings: [],
  dimensions: [],
  stairs: [],
  furniture: [
    {
      id: 'furniture:chair',
      kind: 'furniture',
      floorId: 'g',
      footprintCorners: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
      elevationZ: 0,
      height: CHAIR_HEIGHT_MM,
      assetRef: { scope: 'user', contentHash: MODEL_HASH },
    },
  ],
}

function firstMesh(model: Object3D): Mesh {
  const mesh = model.getObjectByProperty('isMesh', true)
  if (!(mesh instanceof Mesh)) throw new Error('expected the cube model to carry a mesh')
  return mesh
}

describe('useFurnitureModelCache', () => {
  it('frees the geometry of a ready model, though the model holds it, when the hook unmounts', async () => {
    const { result, unmount } = renderHook(() => useFurnitureModelCache(graph))
    await waitFor(() => expect(result.current.lookup.get(MODEL_HASH)?.status).toBe('ready'))
    const template = result.current.lookup.get(MODEL_HASH)?.template
    if (template === undefined) throw new Error('expected a ready template')
    let freed = 0
    firstMesh(template).geometry.addEventListener('dispose', () => {
      freed += 1
    })

    unmount()

    expect(freed).toBe(1)
  })
})
