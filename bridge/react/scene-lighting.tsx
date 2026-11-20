import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo } from 'react'

import {
  colorCheckLighting,
  computeEnvironmentLighting,
  DEFAULT_CLOUD_COVER,
  daylightSiteFor,
  kelvinToLinearRgb,
  NEUTRAL_REFERENCE_WHITE,
  openingInstant,
  toneMappingOperatorFor,
  type Bounds3,
  type LightingMode,
  type ObservationInstant,
  type PlanDirection,
  type Site,
} from '../../core'
import {
  applyToneMappingOperator,
  BasicLightingProvider,
  fitSunShadowToBounds,
  setLightingColor,
  SolarLightingProvider,
  type LightingProvider,
} from '../../engine'
import { effectiveLightingMode } from './effective-lighting-mode'

interface SceneLightingProps {
  colorTemperatureK: number
  bounds: Bounds3 | null
  // The environment props admit undefined (not just absent) so callers can forward
  // optional overrides under exactOptionalPropertyTypes; the schematic defaults
  // (realistic off, the fixed observation instant, a clear sky, no color check) apply
  // either way. A missing site is not a default but a state: the sun is then computed
  // for the sample site, turned so that the front faces due south.
  realistic?: boolean | undefined
  site: Site | undefined
  // The direction the building's front faces; the sample site's implied north follows it.
  front: PlanDirection
  observedAt?: ObservationInstant | undefined
  cloudCover?: number | undefined
  colorCheck?: boolean | undefined
  // Invoked once the applied provider's asynchronous lighting resources (the solar
  // provider's lazily loaded visible sky) have finished attaching; providers without
  // async resources settle immediately. The render harness draws its static frame on
  // this signal so the captured baseline includes the sky; live views rely on the
  // frame loop instead and can omit it.
  onReady?: (() => void) | undefined
}

interface SolarLightingUpdateInput {
  provider: LightingProvider
  site: Site | undefined
  front: PlanDirection
  observedAt: ObservationInstant
  bounds: Bounds3 | null
  cloudCover: number
  colorCheck: boolean
}

/**
 * Drives an applied lighting rig from the site, the observation instant, and the
 * cloud cover: computes the environment lighting and hands it to the provider, neutralized
 * to the color-check reference white when the color check is on. The schematic provider's
 * update is a no-op by contract, so this runs safely in either mode. The sun is computed for
 * the daylight site, which is the stored site where it has a location and the sample site
 * where it has none, so the update runs for every site.
 */
function useSolarLightingUpdate({
  provider,
  site,
  front,
  observedAt,
  bounds,
  cloudCover,
  colorCheck,
}: SolarLightingUpdateInput) {
  const scene = useThree((state) => state.scene)
  const { latLong, northBearing, utcOffsetMinutes } = useMemo(
    () => daylightSiteFor(site, front, observedAt.date),
    [site, front, observedAt.date],
  )
  useLayoutEffect(() => {
    const lighting = computeEnvironmentLighting({
      latLong,
      northBearing,
      utcOffsetMinutes,
      observedAt,
      cloudCover,
    })
    provider.update(scene, colorCheck ? colorCheckLighting(lighting) : lighting, bounds)
  }, [
    provider,
    scene,
    latLong,
    northBearing,
    utcOffsetMinutes,
    observedAt,
    bounds,
    cloudCover,
    colorCheck,
  ])
}

// Settles the optional readiness callback from the provider once its asynchronous
// resources (the solar provider's lazily loaded sky) finish attaching; a provider with
// none reports ready in a microtask. Declared after the caller's apply effect, so the
// readiness it reports is the applied provider's. A provider swap or unmount cancels
// the stale callback: readiness from a disposed provider must not mark the new one.
// Settled, not succeeded, is the contract: a rejected readiness still reports ready,
// so a consumer gating work on the callback (the harness frame) is never left waiting.
function useLightingReadiness(provider: LightingProvider, onReady: (() => void) | undefined) {
  useLayoutEffect(() => {
    if (onReady === undefined) return undefined
    let cancelled = false
    void (provider.whenReady?.() ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) onReady()
      })
    return () => {
      cancelled = true
    }
  }, [provider, onReady])
}

// The one runtime owner of the visible tone-mapping operator. It follows the effective mode,
// which is what the render actually shows; the color check overrides both with Neutral
// (ADR-0142). The 3D library writes its own operator once while it configures the canvas;
// this layout effect runs after, because the library renders the canvas children only once
// configure resolves (see SceneRendererCanvas). The library canvas passes `flat`, so the
// library's own write is the identity and never the visible operator.
function useToneMapping(effectiveMode: LightingMode, colorCheck: boolean) {
  const renderer = useThree((state) => state.gl)
  useLayoutEffect(() => {
    applyToneMappingOperator(renderer, toneMappingOperatorFor(effectiveMode, colorCheck))
  }, [renderer, effectiveMode, colorCheck])
}

/**
 * View-layer glue: applies the engine lighting rig to the persistent render scene once
 * per provider, then keeps it current without rebuilding geometry. Realistic mode swaps
 * in the solar provider (dispose + apply, keyed on the provider instance) and drives its
 * sun from the site and observation instant; the schematic default keeps the fixed rig
 * tinted from the color temperature with its shadow fit to the scene bounds. The lights
 * live on the render scene rather than on the keyed geometry group, so a rebuild does
 * not discard them and a lighting change does not rebuild the geometry. Reports the
 * provider's readiness through the optional onReady callback (the harness gates its
 * captured frame on it). Unit-tested in scene-lighting.test.tsx.
 */
export function SceneLighting({
  colorTemperatureK,
  bounds,
  realistic = false,
  site,
  front,
  observedAt = openingInstant({ site }),
  cloudCover = DEFAULT_CLOUD_COVER,
  colorCheck = false,
  onReady,
}: SceneLightingProps) {
  const scene = useThree((state) => state.scene)
  // The effectiveLightingMode predicate is shared with the ambient-occlusion gate so the two
  // render seams stay in lockstep; realistic mode needs no site location, because the sun
  // then falls back to the sample site.
  const effectiveMode = effectiveLightingMode(realistic)
  const solar = effectiveMode === 'realistic'
  const provider = useMemo<LightingProvider>(
    () => (solar ? new SolarLightingProvider() : new BasicLightingProvider()),
    [solar],
  )

  useLayoutEffect(() => {
    provider.apply(scene)
    return () => provider.dispose(scene)
  }, [provider, scene])

  useLightingReadiness(provider, onReady)

  useToneMapping(effectiveMode, colorCheck)

  useLayoutEffect(() => {
    if (solar) return
    setLightingColor(
      scene,
      colorCheck ? NEUTRAL_REFERENCE_WHITE : kelvinToLinearRgb(colorTemperatureK),
    )
  }, [solar, scene, colorTemperatureK, colorCheck])

  useLayoutEffect(() => {
    if (solar) return
    fitSunShadowToBounds(scene, bounds)
  }, [solar, scene, bounds])

  useSolarLightingUpdate({ provider, site, front, observedAt, bounds, cloudCover, colorCheck })

  return null
}
