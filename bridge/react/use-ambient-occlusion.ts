import { useThree } from '@react-three/fiber'
import { useCallback, useEffect, useRef, type RefObject } from 'react'

import { type Site } from '../../core'
import {
  AO_DEFAULT_PARAMS,
  ambientOcclusionParamsFor,
  buildAmbientOcclusionPipeline,
  renderSceneFrame,
  type AmbientOcclusionPipeline,
} from '../../engine'

import { effectiveLightingMode } from './effective-lighting-mode'

/**
 * Whether the ambient-occlusion pass runs for a view: true only in realistic mode with a
 * located site. Routes the request through the effectiveLightingMode predicate shared with
 * scene-lighting.tsx so AO, the solar provider, and AgX turn on together. A realistic request
 * without a located site, and any schematic view, fall back to the plain renderer draw.
 */
export function ambientOcclusionActiveFor(realistic: boolean, site: Site | undefined): boolean {
  return ambientOcclusionParamsFor(effectiveLightingMode(realistic, site)) !== null
}

/**
 * Draws one scene frame through the active ambient-occlusion pipeline, or straight through
 * the renderer when none is active. Both canvases share this one function: the live view
 * registers it as its per-frame render takeover, and the harness calls it for its static
 * frame. Parameters follow renderSceneFrame's so a caller's renderer, scene, and camera pass
 * straight through.
 */
export type RenderFrame = (
  renderer: Parameters<typeof renderSceneFrame>[0],
  scene: Parameters<typeof renderSceneFrame>[1],
  camera: Parameters<typeof renderSceneFrame>[2],
) => void

// The inputs a pipeline build draws from (the canvas's renderer, scene, and camera, typed as
// the engine factory's own parameters so no guarded three specifier is imported here), paired
// with the refs that guard the async result: buildToken makes a build that resolves after a
// fast toggle or an unmount dispose itself rather than install over a newer one, and warned
// keeps the failure warning to once. onSettled fires once the build promise settles, however
// it settles (install, stale-discard, or failure), so a consumer gating work on it (the render
// harness's captured frame) is never left waiting on a build that will not install.
interface AmbientOcclusionBuild {
  renderer: Parameters<typeof buildAmbientOcclusionPipeline>[0]
  scene: Parameters<typeof buildAmbientOcclusionPipeline>[1]
  camera: Parameters<typeof buildAmbientOcclusionPipeline>[2]
  pipelineRef: RefObject<AmbientOcclusionPipeline | null>
  buildTokenRef: RefObject<number>
  warnedRef: RefObject<boolean>
  onSettled: () => void
}

// Warns once (subsequent build failures stay quiet) that the pipeline build rejected, so a
// stale chunk URL after a redeploy leaves realistic lighting on the plain gl.render fallback
// instead of throwing, mirroring the sky slice's graceful degradation.
function warnBuildFailedOnce(warnedRef: RefObject<boolean>, reason: unknown): void {
  if (warnedRef.current) return
  warnedRef.current = true
  console.warn(
    'Failed to build the ambient-occlusion render pipeline; realistic lighting continues without it',
    reason,
  )
}

// Builds the pipeline and installs it, unless a newer build or a teardown has since bumped the
// token, in which case the freshly built pipeline is disposed rather than installed. The token
// is bumped up front so a teardown that runs before this build resolves already invalidates it.
// This runs only when the active gate is already true, so the tuning is unconditionally the
// realistic defaults (AO_DEFAULT_PARAMS); onSettled fires once the build promise settles below.
function startAmbientOcclusionBuild(build: AmbientOcclusionBuild): void {
  const buildToken = (build.buildTokenRef.current += 1)
  void buildAmbientOcclusionPipeline(build.renderer, build.scene, build.camera, AO_DEFAULT_PARAMS)
    .then((pipeline) => {
      if (buildToken !== build.buildTokenRef.current) {
        pipeline.dispose()
        return
      }
      build.pipelineRef.current = pipeline
    })
    .catch((reason: unknown) => warnBuildFailedOnce(build.warnedRef, reason))
    .then(() => build.onSettled())
}

// One active period's build: it starts as the effect runs, and the teardown it returns bumps
// the build token so a build still in flight disposes itself instead of installing over the
// pipeline this teardown has already disposed, and stays quiet rather than reporting its
// settlement to a caller that has moved on.
function runAmbientOcclusionBuild(
  build: Omit<AmbientOcclusionBuild, 'onSettled'>,
  onSettled: (() => void) | undefined,
): () => void {
  let cancelled = false
  startAmbientOcclusionBuild({
    ...build,
    onSettled: () => {
      if (!cancelled) onSettled?.()
    },
  })
  return () => {
    cancelled = true
    build.buildTokenRef.current += 1
    build.pipelineRef.current?.dispose()
    build.pipelineRef.current = null
  }
}

/**
 * Owns the ambient-occlusion pipeline's React lifecycle for one canvas. When `active` flips
 * true it builds the pipeline from the canvas's renderer, scene, and camera through the engine
 * factory; when it flips false, or the component unmounts, it disposes the pipeline and bumps
 * the build token so any in-flight build cannot install a now-stale pipeline. It calls setSize
 * on canvas-size changes. The returned renderFrame is stable and reads the live pipeline at
 * call time, so a caller registers it once and it follows the active state, falling back to a
 * plain renderer draw whenever the pipeline is null (schematic, the no-location realistic
 * fallback, or a failed build).
 *
 * The optional `onSettled` fires once the active build's promise settles, however it settles
 * (install, stale-discard, or failure), so a caller drawing a single deterministic frame (the
 * render harness under frameloop="never") can defer that frame until the pipeline is installed
 * rather than capturing it before the async build resolves. A build swap or unmount cancels a
 * stale build's callback.
 *
 * The optional `onBuildStarted` fires as each build begins, so a caller that reports whether the
 * view is ready to capture (the live view's readiness facts) can say that the frames drawn from
 * here until settlement are of a pipeline being replaced. Both callbacks are optional, so a
 * caller that needs neither passes neither.
 */
export function useAmbientOcclusion(
  active: boolean,
  onSettled?: () => void,
  onBuildStarted?: () => void,
): RenderFrame {
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  const width = useThree((state) => state.size.width)
  const height = useThree((state) => state.size.height)

  const pipelineRef = useRef<AmbientOcclusionPipeline | null>(null)
  const buildTokenRef = useRef(0)
  const warnedRef = useRef(false)

  useEffect(() => {
    if (!active) return undefined
    onBuildStarted?.()
    return runAmbientOcclusionBuild(
      {
        renderer: gl as unknown as Parameters<typeof buildAmbientOcclusionPipeline>[0],
        scene,
        camera,
        pipelineRef,
        buildTokenRef,
        warnedRef,
      },
      onSettled,
    )
  }, [active, gl, scene, camera, onSettled, onBuildStarted])

  // Presently inert on r184: the pipeline's setSize is a no-op because its PassNode
  // self-reconciles its render target to the renderer size every frame. Kept as the call
  // site for the pipeline's size contract, so a three bump that restores a real setSize needs
  // no new wiring here.
  useEffect(() => {
    pipelineRef.current?.setSize(width, height)
  }, [width, height])

  return useCallback<RenderFrame>((renderer, frameScene, frameCamera) => {
    renderSceneFrame(renderer, frameScene, frameCamera, pipelineRef.current)
  }, [])
}
