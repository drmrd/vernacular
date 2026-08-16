import { useFrame } from '@react-three/fiber'

import { type Site } from '../../core'

import { ambientOcclusionActiveFor, useAmbientOcclusion } from './use-ambient-occlusion'

// Any nonzero useFrame priority disables React Three Fiber's automatic render for a canvas,
// so this hands the live view its per-frame draw. The exact value only orders manual frame
// callbacks against each other. The perceived-color sampler registers a second one at a
// higher number so it reads a frame this callback has already drawn and composited.
const AO_RENDER_PRIORITY = 1

/**
 * Takes over the live canvas's per-frame draw, routing it through the ambient-occlusion pass
 * when the effective lighting mode is realistic and straight through the renderer otherwise.
 * The effective-mode gate (ambientOcclusionActiveFor) mirrors scene-lighting.tsx: a realistic
 * request without a located site falls back to schematic, so AO, the solar provider, and AgX
 * turn on together. Rendering nothing itself, it only registers the takeover; it mounts inside
 * the live Canvas alongside the other useFrame drivers.
 */
export function AmbientOcclusionRenderTakeover({
  realistic,
  site,
}: {
  realistic: boolean
  site: Site | undefined
}) {
  const renderFrame = useAmbientOcclusion(ambientOcclusionActiveFor(realistic, site))
  useFrame((state) => renderFrame(state.gl, state.scene, state.camera), AO_RENDER_PRIORITY)
  return null
}
