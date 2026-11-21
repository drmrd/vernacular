import type * as ThreeWebGPU from 'three/webgpu'

import { applyToneMappingOperator } from './tone-mapping'

/** Options for constructing the WebGPU scene renderer. */
export interface SceneRendererOptions {
  canvas?: HTMLCanvasElement
  antialias?: boolean
  /**
   * Force the WebGL 2 backend regardless of WebGPU availability. Production leaves
   * this off: WebGPURenderer targets WebGPU when `navigator.gpu` is present and
   * already auto-falls-back to its WebGL 2 backend when it is not. The visual
   * harness sets it so the committed baseline is a deterministic hardware-WebGL
   * render that never collides with a future WebGPU baseline.
   */
  forceWebGL?: boolean
  /**
   * Tone-mapping exposure multiplier applied before the Khronos PBR Neutral operator.
   * Defaults to 1 (no exposure change). Realistic daylight scenes tune this later; the
   * schematic baseline leaves it at 1.
   */
  toneMappingExposure?: number
}

/** The parts of the lazily loaded WebGPU build that the renderer factory reads. */
type SceneRendererModule = Pick<
  typeof ThreeWebGPU,
  'WebGPURenderer' | 'PCFSoftShadowMap' | 'SRGBColorSpace'
>

/**
 * Constructs a scene renderer. It does not initialize the backend: the caller starts
 * `renderer.init()` and draws nothing until it resolves.
 */
export type SceneRendererFactory = (options?: SceneRendererOptions) => ThreeWebGPU.WebGPURenderer

let rendererFactoryPromise: Promise<SceneRendererFactory> | undefined

/**
 * Loads the WebGPU build of Three.js and resolves to a synchronous renderer factory over it.
 * The build is imported lazily so it never enters the test or server import graph. The load
 * happens once: every call returns the same promise, so a later mount finds it already settled.
 * A failed load is not kept, so the next call tries again.
 */
export function loadSceneRendererFactory(): Promise<SceneRendererFactory> {
  rendererFactoryPromise ??= import('three/webgpu').then(
    (rendererModule) => (options) => constructSceneRenderer(rendererModule, options),
    (error: unknown) => {
      rendererFactoryPromise = undefined
      throw error
    },
  )
  return rendererFactoryPromise
}

/**
 * Constructs the scene renderer for a canvas from the loaded module, without initializing
 * its backend. This is the one place that constructs a backend renderer. WebGPURenderer auto-selects
 * WebGPU when it is available and falls back to its own WebGL 2 backend otherwise;
 * `forceWebGL` pins the WebGL 2 backend unconditionally for the deterministic visual baseline.
 */
function constructSceneRenderer(
  rendererModule: SceneRendererModule,
  options: SceneRendererOptions = {},
): ThreeWebGPU.WebGPURenderer {
  const { WebGPURenderer: Renderer, PCFSoftShadowMap, SRGBColorSpace } = rendererModule
  const renderer = new Renderer({
    canvas: options.canvas,
    antialias: options.antialias ?? true,
    forceWebGL: options.forceWebGL ?? false,
  })
  // Soft shadow maps stay within the feature set both the WebGPU and the WebGL 2 backend
  // express (foundation spec 5.6); PCF soft filtering softens the directional sun's shadow
  // edges over the cheaper hard-edged basic map.
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFSoftShadowMap
  // Color management: render output is sRGB. Creation seeds Khronos PBR Neutral through the
  // shared applyToneMappingOperator helper, which owns the one domain-to-constant
  // translation. The seed holds only until the 3D library configures the canvas and writes
  // its own value; the operator the canvas shows comes from the scene lighting, which calls
  // the same helper per mode: realistic daylight swaps in AgX, while schematic and the
  // color check keep hue-preserving Neutral (ADR-0142, ADR-0147). Exposure defaults to 1.
  renderer.outputColorSpace = SRGBColorSpace
  applyToneMappingOperator(renderer, 'neutral')
  renderer.toneMappingExposure = options.toneMappingExposure ?? 1
  return renderer
}
