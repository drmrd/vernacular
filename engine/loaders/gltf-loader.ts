import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

/**
 * Parses a GLB ArrayBuffer into a Three.js object, rejecting on any loader error.
 * This is the single seam for the GLTF loader (.claude/rules.md: engine/loaders/ is
 * the only consumer of Three.js loaders).
 */
export function parseGltfBytes(buffer: ArrayBuffer): Promise<THREE.Object3D> {
  const loader = new GLTFLoader()
  return new Promise((resolve, reject) => {
    loader.parse(buffer, '', (gltf) => resolve(gltf.scene), reject)
  })
}
