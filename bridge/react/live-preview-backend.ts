import { detectRenderBackend } from '../../engine'

/**
 * Which backend the live 3D preview will actually render through. The engine's
 * `WebGPURenderer` targets WebGPU when the runtime exposes an adapter and falls back to
 * its own WebGL 2 backend when it does not, so `'webgl2'` is a working preview and only
 * `'unsupported'` means no preview at all.
 */
export type LivePreviewBackend = 'webgpu' | 'webgl2' | 'unsupported'

// Browsers cap how many live WebGL contexts one document may hold, and the answer cannot
// change within a page load, so the probe context is created once and the verdict reused.
// A probe per render would exhaust the cap and take the scene canvas down with it.
let probedBackend: LivePreviewBackend | null = null

function canCreateWebGl2Context(): boolean {
  if (typeof document === 'undefined') {
    return false
  }
  // A runtime can carry the WebGL2RenderingContext constructor and still refuse a context
  // (a blocked GPU, WebGL switched off), so this asks for the context rather than the type.
  return Boolean(document.createElement('canvas').getContext('webgl2'))
}

function probeLivePreviewBackend(): LivePreviewBackend {
  if (detectRenderBackend() === 'webgpu') {
    return 'webgpu'
  }
  return canCreateWebGl2Context() ? 'webgl2' : 'unsupported'
}

/** Reports the backend the live 3D preview will render through on this runtime. */
export function detectLivePreviewBackend(): LivePreviewBackend {
  probedBackend ??= probeLivePreviewBackend()
  return probedBackend
}
