import * as THREE from 'three'

import type { Bounds3, LinearRgb, Vector3 } from '../../core'

/**
 * The shared sun-plus-sky lighting rig: construction plus the operations on a rig
 * already applied to a scene. The lights live on the persistent render scene, so the
 * updates below mutate them in place rather than rebuilding.
 */

/** Pure white light at creation; providers re-tint the rig from the environment as needed. */
const WHITE = 0xffffff
/** A neutral dark ground bounce for the hemisphere fill. */
const GROUND_FILL = 0x444444
// The sun direction's components. The vertical reach dominates so it reads as a high
// daytime key, and the two horizontal reaches differ (X reaches further than Z) so the
// asymmetric azimuth turns the two perpendicular exterior walls toward the sun by
// different amounts; they then separate in value rather than reading equally lit (ADR-0079).
const SUN_REACH_X = 1
const SUN_REACH_UP = 2
const SUN_REACH_Z = 0.35
/** A fixed default sun direction, the rig's initial aim. Treat it as read-only: it is a
 *  shared constant, and the shadow fitter normalizes a clone of it once. */
export const SUN_DIRECTION = new THREE.Vector3(SUN_REACH_X, SUN_REACH_UP, SUN_REACH_Z)
/** A key-dominant rig (ADR-0079): the daytime sun runs brighter than the hemisphere fill
 *  so it sets the value of the faces it reaches, and faces at different angles separate
 *  in value rather than reading equally lit. */
export const DAYLIGHT_SUN_INTENSITY = 1.6
/** The fill only keeps the unlit faces off black; an equal fill washed them out. */
const FILL_INTENSITY = 0.5
/** A 2048px square shadow map: enough resolution for the shell without a large GPU cost. */
const SHADOW_MAP_SIZE = 2048
/** A small negative depth bias to keep large flat faces (the floor) from self-shadowing into acne. */
const SHADOW_BIAS = -0.0005
const SHADOW_DISTANCE_FACTOR = 3
const MIN_SHADOW_NEAR = 1
/** The sun direction as a unit vector, normalized once so the per-call fitter does not allocate. */
const SUN_DIRECTION_NORMALIZED = SUN_DIRECTION.clone().normalize()

/**
 * The lights a single rig owns. A provider keeps this reference from `apply` so it can
 * dispose exactly what it built, rather than rediscovering lights by instanceof scans as
 * the rig grows (a moon sun, non-rig light types).
 */
export interface LightingRig {
  sun: THREE.DirectionalLight
  fill: THREE.HemisphereLight
}

/**
 * Builds the rig and adds it to the scene: a shadow-casting directional sun aimed along
 * SUN_DIRECTION plus a hemisphere fill. Providers own the sun's intensity policy, so it
 * arrives as a parameter; everything else about the rig is shared. Returns the lights so
 * the caller can dispose them by reference.
 */
export function buildLightingRig(scene: THREE.Object3D, sunIntensity: number): LightingRig {
  const sun = new THREE.DirectionalLight(WHITE, sunIntensity)
  sun.position.copy(SUN_DIRECTION)
  sun.castShadow = true
  sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE)
  sun.shadow.bias = SHADOW_BIAS
  const fill = new THREE.HemisphereLight(WHITE, GROUND_FILL, FILL_INTENSITY)
  scene.add(sun, fill)
  return { sun, fill }
}

/** Finds the rig's directional sun on the scene, or undefined when no rig is applied. */
export function findSun(scene: THREE.Object3D): THREE.DirectionalLight | undefined {
  return scene.children.find(
    (child): child is THREE.DirectionalLight => child instanceof THREE.DirectionalLight,
  )
}

function isRigLight(
  child: THREE.Object3D,
): child is THREE.DirectionalLight | THREE.HemisphereLight {
  return child instanceof THREE.DirectionalLight || child instanceof THREE.HemisphereLight
}

/** Tints the sun and the hemisphere sky to a linear-light color. */
export function setLightingColor(scene: THREE.Object3D, color: LinearRgb): void {
  setSunAndSkyColor(scene, color, color)
}

/** Removes the rig's lights so a remount re-applies cleanly rather than stacking them. */
export function removeLighting(scene: THREE.Object3D): void {
  // Snapshot the targets before removing, so the removal does not mutate the array
  // being iterated.
  const lights = scene.children.filter(isRigLight)
  for (const light of lights) {
    scene.remove(light)
  }
}

/**
 * Tints the directional sun and the hemisphere sky to two independent linear-light colors,
 * so a solar model can dim and redden the sun while the sky keeps its own tint.
 */
export function setSunAndSkyColor(
  scene: THREE.Object3D,
  sunColor: LinearRgb,
  skyColor: LinearRgb,
): void {
  for (const child of scene.children) {
    if (child instanceof THREE.DirectionalLight) {
      child.color.setRGB(sunColor.r, sunColor.g, sunColor.b, THREE.LinearSRGBColorSpace)
    } else if (child instanceof THREE.HemisphereLight) {
      child.color.setRGB(skyColor.r, skyColor.g, skyColor.b, THREE.LinearSRGBColorSpace)
    }
  }
}

/**
 * Positions the sun along its fixed direction outside the scene bounds and sizes its
 * orthographic shadow camera to cover them, so the shell casts a shadow without wasting
 * shadow-map resolution. The light direction is preserved.
 */
export function fitSunShadowToBounds(scene: THREE.Object3D, bounds: Bounds3 | null): void {
  fitSunShadowAlongUnitDirection(scene, SUN_DIRECTION_NORMALIZED, bounds)
}

/**
 * Positions the sun along an explicit direction (pointing from the scene toward the sun,
 * normalized internally so callers need not pre-normalize) outside the scene bounds and
 * sizes its orthographic shadow camera to cover them, so a solar model can steer the
 * light while keeping the shadow fit.
 */
export function fitSunShadowToDirection(
  scene: THREE.Object3D,
  direction: Vector3,
  bounds: Bounds3 | null,
): void {
  const unitDirection = new THREE.Vector3(direction.x, direction.y, direction.z).normalize()
  fitSunShadowAlongUnitDirection(scene, unitDirection, bounds)
}

// Invariant: `direction` must be pre-normalized by the caller; a non-unit vector silently mis-fits the shadow.
function fitSunShadowAlongUnitDirection(
  scene: THREE.Object3D,
  direction: THREE.Vector3,
  bounds: Bounds3 | null,
): void {
  if (bounds === null) return
  const sun = findSun(scene)
  if (sun === undefined) return

  const center = new THREE.Vector3(
    (bounds.min.x + bounds.max.x) / 2,
    (bounds.min.y + bounds.max.y) / 2,
    (bounds.min.z + bounds.max.z) / 2,
  )
  const radius =
    Math.hypot(
      bounds.max.x - bounds.min.x,
      bounds.max.y - bounds.min.y,
      bounds.max.z - bounds.min.z,
    ) / 2
  const distance = radius * SHADOW_DISTANCE_FACTOR

  sun.position.copy(center).addScaledVector(direction, distance)
  sun.target.position.copy(center)
  sun.target.updateMatrixWorld()

  const camera = sun.shadow.camera
  camera.left = -radius
  camera.right = radius
  camera.top = radius
  camera.bottom = -radius
  // Near plane at the sun-facing edge of the bounding sphere, far plane past its far edge.
  camera.near = Math.max(MIN_SHADOW_NEAR, distance - radius)
  camera.far = distance + radius
  camera.updateProjectionMatrix()
}
