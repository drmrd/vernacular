import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo } from 'react'

import {
  computeEnvironmentLighting,
  DEFAULT_CLOUD_COVER,
  DEFAULT_OBSERVATION_INSTANT,
  kelvinToLinearRgb,
  utcOffsetMinutesFor,
  type Bounds3,
  type ObservationInstant,
  type Site,
} from '../../core'
import {
  BasicLightingProvider,
  fitSunShadowToBounds,
  removeLighting,
  setLightingColor,
  SolarLightingProvider,
  type LightingProvider,
} from '../../engine'

interface SceneLightingProps {
  colorTemperatureK: number
  bounds: Bounds3 | null
  // The environment props admit undefined (not just absent) so callers can forward
  // optional overrides under exactOptionalPropertyTypes; the schematic defaults
  // (realistic off, the fixed observation instant) apply either way. A site has no
  // default: without one the schematic provider is the only choice.
  realistic?: boolean | undefined
  site: Site | undefined
  observedAt?: ObservationInstant | undefined
}

interface SolarLightingUpdateInput {
  provider: LightingProvider
  site: Site | undefined
  observedAt: ObservationInstant
  bounds: Bounds3 | null
}

/**
 * Drives an applied lighting rig from the site and the observation instant: computes
 * the environment lighting (a clear sky for now; the slice-1b weather layer owns cloud
 * cover) and hands it to the provider. The schematic provider's update is a no-op by
 * contract, so this runs safely in either mode; without a site location it does nothing.
 */
function useSolarLightingUpdate({ provider, site, observedAt, bounds }: SolarLightingUpdateInput) {
  const scene = useThree((state) => state.scene)
  const { latLong, northBearing, timezone } = site ?? {}
  useLayoutEffect(() => {
    if (latLong === undefined) return
    const lighting = computeEnvironmentLighting({
      latLong,
      northBearing: northBearing ?? 0,
      utcOffsetMinutes: utcOffsetMinutesFor(timezone, observedAt.date),
      observedAt,
      cloudCover: DEFAULT_CLOUD_COVER,
    })
    provider.update(scene, lighting, bounds)
  }, [provider, scene, latLong, northBearing, timezone, observedAt, bounds])
}

/**
 * View-layer glue: applies the engine lighting rig to the persistent render scene once
 * per provider, then keeps it current without rebuilding geometry. Realistic mode swaps
 * in the solar provider (remove + apply, keyed on the provider instance) and drives its
 * sun from the site and observation instant; the schematic default keeps the fixed rig
 * tinted from the color temperature with its shadow fit to the scene bounds. The lights
 * live on the render scene rather than on the keyed geometry group, so a rebuild does
 * not discard them and a lighting change does not rebuild the geometry. Runs only under
 * a real render; coverage-excluded, proven by the scene-webgl tier.
 */
export function SceneLighting({
  colorTemperatureK,
  bounds,
  realistic = false,
  site,
  observedAt = DEFAULT_OBSERVATION_INSTANT,
}: SceneLightingProps) {
  const scene = useThree((state) => state.scene)
  // Realistic mode without a site location falls back to the schematic provider; the
  // slice-1b environment panel owns the missing-location UX (ADR-0144).
  const solar = realistic && site?.latLong !== undefined
  const provider = useMemo(
    () => (solar ? new SolarLightingProvider() : new BasicLightingProvider()),
    [solar],
  )

  useLayoutEffect(() => {
    provider.apply(scene)
    return () => removeLighting(scene)
  }, [provider, scene])

  useLayoutEffect(() => {
    if (solar) return
    setLightingColor(scene, kelvinToLinearRgb(colorTemperatureK))
  }, [solar, scene, colorTemperatureK])

  useLayoutEffect(() => {
    if (solar) return
    fitSunShadowToBounds(scene, bounds)
  }, [solar, scene, bounds])

  useSolarLightingUpdate({ provider, site, observedAt, bounds })

  return null
}
