import * as THREE from 'three'

/** A resource that holds GPU memory until it is disposed. */
export type GpuResource = THREE.BufferGeometry | THREE.Material | THREE.Texture

const heldResources = new WeakSet<GpuResource>()

/**
 * Marks a resource as held by a long-lived owner such as a material provider or an asset cache.
 * A scene tree walk skips held resources; only the owner frees them. The mark lives in a
 * module-level set, not in userData, because a clone must not inherit it.
 * Marking a material does not hold the textures it carries, and `Material.clone`
 * shares those textures, so an owner marks each texture it keeps as well.
 */
export function markCacheHeld(resource: GpuResource): void {
  heldResources.add(resource)
}

/** Whether a long-lived owner holds the resource. */
export function isCacheHeld(resource: GpuResource): boolean {
  return heldResources.has(resource)
}

function toMaterialArray(material: THREE.Material | THREE.Material[]): THREE.Material[] {
  return Array.isArray(material) ? material : [material]
}

function isDrawable(object: THREE.Object3D): object is THREE.Mesh | THREE.Line | THREE.Points {
  return (
    object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points
  )
}

function collectResources(root: THREE.Object3D): Set<GpuResource> {
  const resources = new Set<GpuResource>()
  root.traverse((object) => {
    if (!isDrawable(object)) return
    resources.add(object.geometry)
    for (const material of toMaterialArray(object.material)) {
      resources.add(material)
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) resources.add(value)
      }
    }
  })
  return resources
}

/**
 * Frees the geometries, materials, and textures of the meshes, lines, and points in an object
 * tree. Each resource is freed once per call, however many objects share it. Resources a
 * long-lived owner holds (see markCacheHeld) are left alone.
 */
export function disposeObject(root: THREE.Object3D): void {
  for (const resource of collectResources(root)) {
    if (!isCacheHeld(resource)) resource.dispose()
  }
}

/**
 * Frees every resource of an object tree, held ones included. The owner of the held resources,
 * such as a model cache releasing a template, calls this when it lets the tree go.
 */
export function releaseCachedObject(root: THREE.Object3D): void {
  for (const resource of collectResources(root)) resource.dispose()
}
