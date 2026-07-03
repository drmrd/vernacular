import type { WebGPURenderer } from 'three/webgpu'

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

/**
 * Creates and initializes the WebGPU renderer. Three.js is imported lazily so the
 * WebGPU build never enters the test or server import graph; this is the one place
 * that constructs a backend renderer. WebGPURenderer auto-selects WebGPU when it is
 * available and falls back to its own WebGL 2 backend otherwise; `forceWebGL` pins
 * the WebGL 2 backend unconditionally for the deterministic visual baseline.
 */
export async function createSceneRenderer(
  options: SceneRendererOptions = {},
): Promise<WebGPURenderer> {
  const {
    WebGPURenderer: Renderer,
    PCFSoftShadowMap,
    NeutralToneMapping,
    SRGBColorSpace,
  } = await import('three/webgpu')
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
  // Color management: render output is sRGB. Creation seeds Khronos PBR Neutral as the
  // tone-mapping operator, but the operator is now chosen per mode at runtime by the scene
  // lighting (applyToneMappingOperator): realistic daylight swaps in AgX, while schematic
  // and the color check keep hue-preserving Neutral (ADR-0142). Exposure defaults to 1.
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = NeutralToneMapping
  renderer.toneMappingExposure = options.toneMappingExposure ?? 1
  await renderer.init()
  return renderer
}
