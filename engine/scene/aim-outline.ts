import * as THREE from 'three'

import type { OpeningAimOutline } from '../../core'

/** Warm, so it reads apart from the white selection outline. */
export const AIM_OUTLINE_COLOR = 0xffcc66

const AIM_OUTLINE_RENDER_ORDER = 2
const CLOSED_PATH_POINT_COUNT = 5
const COMPONENTS_PER_POINT = 3

/** The group that holds the aim outline, added once to the persistent scene. */
export function createAimOutlineGroup(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'aim-outline'
  return group
}

/** Shows one closed line through the four corners, or nothing for `null`. */
export function reconcileAimOutline(group: THREE.Group, outline: OpeningAimOutline | null): void {
  if (outline === null) {
    clearAimOutline(group)
    return
  }
  const existing = group.children[0]
  if (existing instanceof THREE.Line) {
    writePositions(existing.geometry.getAttribute('position') as THREE.BufferAttribute, outline)
    return
  }
  group.add(createAimLine(outline))
}

function clearAimOutline(group: THREE.Group): void {
  for (const child of group.children) {
    if (child instanceof THREE.Line) {
      const material = child.material as THREE.Material
      child.geometry.dispose()
      material.dispose()
    }
  }
  group.clear()
}

function createPositions(outline: OpeningAimOutline): THREE.BufferAttribute {
  const attribute = new THREE.BufferAttribute(
    new Float32Array(CLOSED_PATH_POINT_COUNT * COMPONENTS_PER_POINT),
    COMPONENTS_PER_POINT,
  )
  writePositions(attribute, outline)
  return attribute
}

/** Five points, not a line loop, because the WebGPU renderer need not close a loop. */
function writePositions(attribute: THREE.BufferAttribute, outline: OpeningAimOutline): void {
  const closedPath = [...outline, outline[0]]
  closedPath.forEach((corner, index) => attribute.setXYZ(index, corner.x, corner.y, corner.z))
  attribute.needsUpdate = true
}

function createAimLine(outline: OpeningAimOutline): THREE.Line {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', createPositions(outline))
  const material = new THREE.LineBasicMaterial({ color: AIM_OUTLINE_COLOR, depthTest: false })
  const line = new THREE.Line(geometry, material)
  line.renderOrder = AIM_OUTLINE_RENDER_ORDER
  line.frustumCulled = false
  return line
}
