import * as THREE from 'three'
import type { FurnitureSceneNode, Point } from '../../core'
import { FURNITURE_NODE_PREFIX } from '../../core'
import { parseGltfBytes } from '../loaders/gltf-loader'
import { markShadowCasters } from './shadow-casters'

/** Parses GLB bytes into a Three.js object, rejecting on any loader error. */
export function parseFurnitureModel(bytes: Uint8Array): Promise<THREE.Object3D> {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return parseGltfBytes(buffer)
}

function edgeLength(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/**
 * Fits a parsed model into a furniture node's footprint and height. Scales uniformly to fit
 * inside the box, centers on the footprint center in plan, anchors the model's bottom to the
 * elevation, and rotates to the footprint orientation. Returns null when the model has no usable
 * geometry, so the caller can fall back to the box.
 */
export function normalizeModelIntoBox(
  model: THREE.Object3D,
  node: FurnitureSceneNode,
): THREE.Group | null {
  model.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(model)
  if (box.isEmpty()) return null
  const size = box.getSize(new THREE.Vector3())
  if (size.x === 0 || size.y === 0 || size.z === 0) return null

  const [tl, tr, br, bl] = node.footprintCorners
  const targetWidth = edgeLength(tl, tr)
  const targetDepth = edgeLength(tl, bl)
  const targetHeight = node.height
  const scale = Math.min(targetWidth / size.x, targetHeight / size.y, targetDepth / size.z)

  const center = box.getCenter(new THREE.Vector3())
  const footprintCenter = { x: (tl.x + br.x) / 2, y: (tl.y + br.y) / 2 }
  const rotationRadians = Math.atan2(tr.y - tl.y, tr.x - tl.x)

  // Inner wrapper recenters the model's bounding box to the origin and lifts its base to y=0.
  const inner = new THREE.Group()
  inner.position.set(-center.x, -box.min.y, -center.z)
  inner.add(model)

  // Outer wrapper scales uniformly, rotates about the vertical axis, and places it in plan.
  // Plan x maps to world x, plan y maps to world z; world y is up at the elevation.
  const outer = new THREE.Group()
  outer.add(inner)
  outer.scale.setScalar(scale)
  outer.rotation.y = -rotationRadians
  outer.position.set(footprintCenter.x, node.elevationZ, footprintCenter.y)
  return outer
}

/**
 * Wraps a normalized model as a furniture sub-group that selects like the box it replaces.
 * Returns a group with no child when the model has no usable geometry (normalizeModelIntoBox
 * returned null), so the caller can decide to fall back to the box.
 */
export function buildFurnitureModelGroup(
  model: THREE.Object3D,
  node: FurnitureSceneNode,
): THREE.Group {
  const placed = normalizeModelIntoBox(model, node)
  const group = new THREE.Group()
  if (placed !== null) group.add(placed)
  group.name = node.id
  group.userData.entityId = node.id.slice(FURNITURE_NODE_PREFIX.length)
  markShadowCasters(group)
  return group
}
