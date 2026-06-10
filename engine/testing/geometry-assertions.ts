import * as THREE from 'three'
import type { Vector3 } from '../../core'

function triples(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): Vector3[] {
  const out: Vector3[] = []
  for (let i = 0; i < attribute.count; i += 1) {
    out.push({ x: attribute.getX(i), y: attribute.getY(i), z: attribute.getZ(i) })
  }
  return out
}

export function readPositions(geometry: THREE.BufferGeometry): Vector3[] {
  const attribute = geometry.getAttribute('position')
  return attribute ? triples(attribute) : []
}

export function readNormals(geometry: THREE.BufferGeometry): Vector3[] {
  const attribute = geometry.getAttribute('normal')
  return attribute ? triples(attribute) : []
}

export function readIndex(geometry: THREE.BufferGeometry): number[] {
  return geometry.index ? Array.from(geometry.index.array) : []
}

export interface MaterialGroup {
  start: number
  count: number
  materialIndex: number
}

export function materialGroups(geometry: THREE.BufferGeometry): MaterialGroup[] {
  return geometry.groups.map((g) => ({
    start: g.start,
    count: g.count,
    materialIndex: g.materialIndex ?? 0,
  }))
}

export function findByEntityId(root: THREE.Object3D, entityId: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null
  root.traverse((object) => {
    if (found === null && object.userData.entityId === entityId) found = object
  })
  return found
}

export function collectEntityIds(root: THREE.Object3D): string[] {
  const ids: string[] = []
  root.traverse((object) => {
    if (typeof object.userData.entityId === 'string') ids.push(object.userData.entityId)
  })
  return ids
}
