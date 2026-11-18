import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import type { SceneGraph } from '../../core'
import { nodesOf, offCenterPartitionFloor } from '../../core/scene/wall-runs-test-fixtures'
import { NeutralMaterialProvider } from '../materials/neutral-material-provider'
import { buildScene } from './build-scene'
import { wallSpanOf, WALL_SPAN_KEY, type WallSpan } from './wall-span'

/** The block of two rooms, with the partition at x = 3000, as a scene graph of one floor. */
function partitionedBlockGraph(): SceneGraph {
  return {
    nodes: [{ id: 'floor:g', kind: 'floor', name: 'Ground', elevation: 0 }],
    ...nodesOf(offCenterPartitionFloor()),
    underlays: [],
    dimensions: [],
    stairs: [],
    furniture: [],
  }
}

/** Every mesh under `root` that carries `entityId`, in traversal order. */
function meshesOf(root: THREE.Object3D, entityId: string): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = []
  root.traverse((object) => {
    if (object instanceof THREE.Mesh && object.userData.entityId === entityId) {
      meshes.push(object)
    }
  })
  return meshes
}

const byStart = (a: WallSpan, b: WallSpan): number => a.fromMm - b.fromMm

describe('the span a wall mesh records', () => {
  const root = buildScene(partitionedBlockGraph(), new NeutralMaterialProvider())

  it('covers, for each piece of a wall split at a partition, the stretch from its start', () => {
    const meshes = meshesOf(root, 'wall:south')
    const spans = meshes.map((mesh) => wallSpanOf(mesh) as WallSpan).sort(byStart)

    expect(meshes).toHaveLength(2)
    expect(spans).toEqual([
      { fromMm: 0, toMm: 3000 },
      { fromMm: 3000, toMm: 8000 },
    ])
    expect(meshes.map((mesh) => mesh.userData[WALL_SPAN_KEY] as WallSpan).sort(byStart)).toEqual(
      spans,
    )
  })

  it('is undefined on an object that records none', () => {
    expect(wallSpanOf(new THREE.Mesh())).toBeUndefined()
  })
})
