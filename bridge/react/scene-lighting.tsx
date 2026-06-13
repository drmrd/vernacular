import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo } from 'react'

import { kelvinToLinearRgb, type Bounds3 } from '../../core'
import {
  BasicLightingProvider,
  fitSunShadowToBounds,
  removeLighting,
  setLightingColor,
} from '../../engine'

interface SceneLightingProps {
  colorTemperatureK: number
  bounds: Bounds3 | null
}

/**
 * View-layer glue: applies the engine lighting rig to the persistent render scene once,
 * then tints it from the color temperature and fits its shadow to the scene bounds,
 * without rebuilding geometry. The lights live on the render scene rather than on the
 * keyed geometry group, so a rebuild does not discard them and a temperature change does
 * not rebuild the geometry. Runs only under a real render; coverage-excluded, proven by
 * the scene-webgl tier.
 */
export function SceneLighting({ colorTemperatureK, bounds }: SceneLightingProps) {
  const scene = useThree((state) => state.scene)
  const provider = useMemo(() => new BasicLightingProvider(), [])

  useLayoutEffect(() => {
    provider.apply(scene)
    return () => removeLighting(scene)
  }, [provider, scene])

  useLayoutEffect(() => {
    setLightingColor(scene, kelvinToLinearRgb(colorTemperatureK))
  }, [scene, colorTemperatureK])

  useLayoutEffect(() => {
    fitSunShadowToBounds(scene, bounds)
  }, [scene, bounds])

  return null
}
