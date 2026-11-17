import { useFrame } from '@react-three/fiber'
import { useEffect } from 'react'

import { ambientOcclusionActiveFor, useAmbientOcclusion } from './use-ambient-occlusion'

// Any nonzero useFrame priority disables React Three Fiber's automatic render for a canvas,
// so this hands the live view its per-frame draw. The exact value only orders manual frame
// callbacks against each other. The perceived-color sampler registers a second one at a
// higher number so it reads a frame this callback has already drawn and composited.
const AO_RENDER_PRIORITY = 1

/**
 * Takes over the live canvas's per-frame draw, routing it through the ambient-occlusion pass
 * when the effective lighting mode is realistic and straight through the renderer otherwise.
 * The effective-mode gate (ambientOcclusionActiveFor) mirrors scene-lighting.tsx, so AO, the
 * solar provider, and AgX turn on together for the same request, with or without a site
 * location. Rendering nothing itself, it only registers the takeover; it mounts inside
 * the live Canvas alongside the other useFrame drivers.
 *
 * The two build callbacks are the live view's readiness seam: they report when a pipeline build
 * starts and when it settles, so a frame drawn while the pipeline is being replaced does not
 * count as the view being ready to capture. The takeover also settles the in-flight state when
 * it turns off or unmounts, because a build it stops that way never reports settlement itself.
 */
export function AmbientOcclusionRenderTakeover({
  realistic,
  onPipelineBuildStarted,
  onPipelineSettled,
}: {
  realistic: boolean
  onPipelineBuildStarted: () => void
  onPipelineSettled: () => void
}) {
  const active = ambientOcclusionActiveFor(realistic)
  const renderFrame = useAmbientOcclusion(active, onPipelineSettled, onPipelineBuildStarted)
  // A build stopped by turning off or unmounting never settles itself, so the cleanup settles it.
  // All cleanups of a flush run before any setup, so the start note of a replacement build lands
  // after this one.
  useEffect(() => (active ? onPipelineSettled : undefined), [active, onPipelineSettled])
  useFrame((state) => renderFrame(state.gl, state.scene, state.camera), AO_RENDER_PRIORITY)
  return null
}
