/** Which 3D backend the runtime can use. The WebGL2 fallback is a later phase. */
export type RenderBackend = 'webgpu' | 'unsupported'

export function detectRenderBackend(): RenderBackend {
  return typeof navigator !== 'undefined' && 'gpu' in navigator ? 'webgpu' : 'unsupported'
}
