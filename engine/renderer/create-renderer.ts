import type { WebGPURenderer } from 'three/webgpu'

/** Options for constructing the WebGPU scene renderer. */
export interface SceneRendererOptions {
  canvas?: HTMLCanvasElement
  antialias?: boolean
}

/**
 * Creates and initializes the WebGPU renderer. Three.js is imported lazily so the
 * WebGPU build never enters the test or server import graph; this is the one place
 * that constructs a backend renderer. The WebGL2 fallback renderer arrives later.
 */
export async function createSceneRenderer(
  options: SceneRendererOptions = {},
): Promise<WebGPURenderer> {
  const { WebGPURenderer: Renderer } = await import('three/webgpu')
  const renderer = new Renderer({ canvas: options.canvas, antialias: options.antialias ?? true })
  await renderer.init()
  return renderer
}
