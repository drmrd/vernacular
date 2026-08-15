import * as THREE from 'three'
import type { SkyMesh } from 'three/examples/jsm/objects/SkyMesh.js'

import type { Bounds3, EnvironmentLighting, LinearRgb, Vector3 } from '../../core'

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
/**
 * One shadow-map texel's diagonal, as a fraction of the shadow camera's extent, measured in the
 * light's image plane. Both shadow constants derive from it, because the depth a fragment is
 * compared against belongs to a surface point roughly a diagonal away in that plane: the texel's
 * own quantization plus the PCFSoft neighborhood the renderer samples. The split between those
 * two is an estimate, so the diagonal is an order-of-magnitude scale rather than an exact budget.
 * ADR-0158 derives it.
 */
const TEXEL_DIAGONAL_FRACTION = Math.SQRT2 / SHADOW_MAP_SIZE
/**
 * The depth bias, in the normalized [0, 1] light-space depth three adds it to, not a world
 * length. The fitter below stands the sun off at SHADOW_DISTANCE_FACTOR bounding radii, which
 * makes its orthographic shadow camera span 2 * radius in depth as well as laterally (until
 * MIN_SHADOW_NEAR clamps the near plane, which takes a sub-millimeter scene). One texel
 * therefore covers the same fraction of both, and this bias needs no scene size to be right.
 * Negative because three adds it to the fragment's own depth, and the shallower one stays lit.
 * Half of a pair: `calibrateShadowBias` sets it alongside its world-space partner.
 */
const SHADOW_BIAS = -TEXEL_DIAGONAL_FRACTION
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
  /** The visible sky, solar mode only. */
  sky?: SkyMesh
  /**
   * The sky's image-based light, solar mode only: an equirectangular radiance map assigned
   * to the scene's environment, carrying both the diffuse ambient and the specular
   * reflection. It replaces the fill, and replaced the light probe that preceded it
   * (ADR-0161); running any two of the three would count the sky's ambient twice.
   */
  environment?: THREE.DataTexture
  /**
   * Set true by `disposeLightingRig` so a lazy sky attach still in flight becomes a no-op:
   * the sky loads off the startup path, so a rig can be disposed before its module resolves.
   */
  disposed?: boolean
  /**
   * The latest lighting seen before the lazy sky arrived. `updateSkyEnvironment` stashes it
   * here (latest wins) so the attach can replay it onto the sky the moment it is constructed.
   */
  pendingLighting?: EnvironmentLighting | undefined
}

/**
 * Builds the rig and adds it to the scene: a directional sun aimed along SUN_DIRECTION
 * plus a hemisphere fill. Providers own the sun's intensity and shadow-casting policies,
 * so both arrive as parameters. Returns the lights so the caller can dispose them by
 * reference.
 */
export function buildLightingRig(
  scene: THREE.Object3D,
  sunIntensity: number,
  castShadow = true,
): LightingRig {
  const sun = new THREE.DirectionalLight(WHITE, sunIntensity)
  sun.position.copy(SUN_DIRECTION)
  sun.castShadow = castShadow
  sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE)
  // Only the scene-independent half of the acne calibration can be set here, since the other
  // half is a world length and no bounds are known yet. `calibrateShadowBias` sets both once the
  // fitter has a radius; until a fit runs the sun casts with no slope compensation at all.
  sun.shadow.bias = SHADOW_BIAS
  const fill = new THREE.HemisphereLight(WHITE, GROUND_FILL, FILL_INTENSITY)
  scene.add(sun, fill)
  return { sun, fill }
}

/**
 * Tears down a rig a provider built with `buildLightingRig`: removes its two lights from
 * the scene and disposes each, freeing GPU resources. `dispose()` on the sun is what frees
 * its shadow map, so a provider must call this rather than just detaching the lights. A
 * solar rig also carries a visible sky, which is removed and disposed when present, and the
 * teardown still works on a rig that never attached one. Marking the rig disposed abandons
 * a sky whose module is still loading so it never joins the scene.
 */
export function disposeLightingRig(scene: THREE.Object3D, rig: LightingRig): void {
  rig.disposed = true
  rig.pendingLighting = undefined
  scene.remove(rig.sun, rig.fill)
  rig.sun.dispose()
  rig.fill.dispose()
  if (rig.sky !== undefined) {
    scene.remove(rig.sky)
    rig.sky.geometry.dispose()
    rig.sky.material.dispose()
  }
}

/** Finds the rig's directional sun on the scene, or undefined when no rig is applied. */
export function findSun(scene: THREE.Object3D): THREE.DirectionalLight | undefined {
  return scene.children.find(
    (child): child is THREE.DirectionalLight => child instanceof THREE.DirectionalLight,
  )
}

/** Tints the sun and the hemisphere sky to a linear-light color. */
export function setLightingColor(scene: THREE.Object3D, color: LinearRgb): void {
  setSunAndSkyColor(scene, color, color)
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

/** Sets the sun's intensity directly, e.g. to fade it toward the horizon or extinguish it below. */
export function setSunIntensity(scene: THREE.Object3D, intensity: number): void {
  const sun = findSun(scene)
  if (sun === undefined) return
  sun.intensity = intensity
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

/** TEXEL_DIAGONAL_FRACTION in world millimeters, across a shadow camera fitted at `radius`. */
function shadowTexelDiagonalMm(radius: number): number {
  return TEXEL_DIAGONAL_FRACTION * (2 * radius)
}

/**
 * Sets both halves of the shadow's acne calibration for a camera fitted at `radius`, so the two
 * are read and changed together (ADR-0158). They are not interchangeable: `bias` is normalized
 * depth and scene-independent, `normalBias` is world millimeters and scales with the fit.
 *
 * The shadow map quantizes position in the light's image plane, so for a surface at angle theta
 * to the light a texel diagonal of separation there is worth `diagonal * tan(theta)` of depth
 * error. That grows without bound toward grazing incidence, so no pair covers everything and the
 * useful question is how steep a surface it reaches. The depth bias alone, being one whole
 * diagonal, holds to 45 degrees. Adding a normal offset of one diagonal buys back
 * `diagonal * cos(theta)` on top, extending the reach to about 57 degrees, the root of
 * `cos(theta) + 1 = tan(theta)`. That gain is why the pair exists rather than a constant alone.
 */
function calibrateShadowBias(sun: THREE.DirectionalLight, radius: number): void {
  sun.shadow.bias = SHADOW_BIAS
  sun.shadow.normalBias = shadowTexelDiagonalMm(radius)
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

  calibrateShadowBias(sun, radius)

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
