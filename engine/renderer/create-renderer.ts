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
  const { WebGPURenderer: Renderer } = await import('three/webgpu')
  const renderer = new Renderer({
    canvas: options.canvas,
    antialias: options.antialias ?? true,
    forceWebGL: options.forceWebGL ?? false,
  })
  await renderer.init()
  return renderer
}
