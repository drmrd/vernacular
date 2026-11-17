// Guards the renderer library's decision to upload a mesh again. Render objects with the same
// shader share one observer, and a mesh that moved must be uploaded whatever its place in the
// draw order. Otherwise a door that draws second once it is shut stays drawn part-open. The test
// reads the observer from the build that the application loads (three/webgpu), so it also guards
// the patch of that build. Its declared types are too narrow for plain render objects, so the
// test types the parts it uses. See ADR-0217.
import * as THREE from 'three'
import { NodeMaterialObserver as NodeMaterialObserverClass } from 'three/webgpu'
import { describe, expect, it } from 'vitest'

import type { HingeMotion } from '../../core'

import { applyOpeningMotion } from './opening-motion'

interface PlainRenderObject {
  object: THREE.Mesh
  material: THREE.Material
  geometry: THREE.BufferGeometry
  bundle: null
  lightsNode: { getLights: () => [] }
  context: { width: number; height: number }
}

interface Frame {
  renderId: number
  renderer: { getMRT: () => null }
}

interface Observer {
  needsRefresh: (renderObject: PlainRenderObject, frame: Frame) => unknown
}

interface ObserverBuilder {
  material: THREE.Material
  object: THREE.Mesh
  context: object
}

const NodeMaterialObserver = NodeMaterialObserverClass as unknown as new (
  builder: ObserverBuilder,
) => Observer

const DOOR_HINGE: HingeMotion = {
  kind: 'hinge',
  edge: 'jamb',
  pivot: { x: 0.45, y: 0, z: 0 },
  axis: { x: 0, y: 1, z: 0 },
  openAngle: Math.PI / 2,
  partId: 'primary',
  partCount: 1,
}

function plainRenderObject(mesh: THREE.Mesh): PlainRenderObject {
  return {
    object: mesh,
    material: mesh.material as THREE.Material,
    geometry: mesh.geometry,
    bundle: null,
    lightsNode: { getLights: () => [] },
    context: { width: 1, height: 1 },
  }
}

// A door leaf inside a group and a window bar that share one observer, as a door leaf and the
// bars of a hung window do. The scene is built shut.
function buildDoorAndBar() {
  const scene = new THREE.Group()
  const doorGroup = new THREE.Group()
  const leafMaterial = new THREE.MeshStandardMaterial()
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2, 0.04), leafMaterial)
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1, 0.06, 0.05), new THREE.MeshStandardMaterial())
  doorGroup.add(leaf)
  scene.add(doorGroup, bar)
  const observer = new NodeMaterialObserver({ material: leafMaterial, object: leaf, context: {} })
  const door = plainRenderObject(leaf)
  const windowBar = plainRenderObject(bar)
  let renderId = 0

  // One render: the world matrices are brought up to date, then each render object asks the
  // observer in draw order. The answers say which render objects would be uploaded.
  function render(...drawOrder: PlainRenderObject[]): boolean[] {
    renderId += 1
    scene.updateMatrixWorld()
    const frame: Frame = { renderId, renderer: { getMRT: () => null } }
    return drawOrder.map((renderObject) => Boolean(observer.needsRefresh(renderObject, frame)))
  }

  return { doorGroup, door, windowBar, render }
}

describe('uploading a mesh that shares its shader with other meshes', () => {
  it('uploads a door that returns to its shut pose even though it now draws after the window bar', () => {
    // Arrange: shut, with the window bar drawn first; then a swing during which the leaf draws first.
    const { doorGroup, door, windowBar, render } = buildDoorAndBar()
    render(windowBar, door)
    render(windowBar, door)
    for (const openness of [0.4, 1, 0.6, 0.2]) {
      applyOpeningMotion(doorGroup, DOOR_HINGE, openness)
      const [doorUploaded] = render(door, windowBar)
      expect(doorUploaded, `the leaf is uploaded at openness ${openness}`).toBe(true)
    }

    // Act: the swing lands shut and the leaf draws after the window bar again.
    applyOpeningMotion(doorGroup, DOOR_HINGE, 0)
    const [, doorUploaded] = render(windowBar, door)

    // Assert: the shut pose differs from the pose uploaded last, so it is uploaded.
    expect(doorUploaded, 'the shut pose of the leaf is uploaded').toBe(true)
  })

  it('does not upload a mesh that did not move and draws after another mesh', () => {
    // Arrange: one render that records both meshes.
    const { door, windowBar, render } = buildDoorAndBar()
    render(windowBar, door)

    // Act: a second render with nothing moved and the same draw order.
    const [, doorUploaded] = render(windowBar, door)

    // Assert
    expect(doorUploaded).toBe(false)
  })

  it('uploads the mesh that draws first in a render even though it did not move', () => {
    // Arrange: one render that records both meshes.
    const { door, windowBar, render } = buildDoorAndBar()
    render(windowBar, door)

    // Act: a second render with nothing moved and the other draw order.
    const [doorUploaded] = render(door, windowBar)

    // Assert
    expect(doorUploaded).toBe(true)
  })
})
