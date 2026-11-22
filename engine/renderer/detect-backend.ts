/**
 * Which backend the live 3D preview will render through. The probe is synchronous: it
 * answers `'webgpu'` when the browser exposes the WebGPU API (`navigator.gpu`), without
 * asking for an adapter. When the API exists but no adapter comes, the engine's
 * `WebGPURenderer` falls back to its own WebGL 2 backend at start, so `'webgl2'` is a
 * working preview and only `'unsupported'` means no preview at all.
 */
export type RenderBackend = 'webgpu' | 'webgl2' | 'unsupported'

// Browsers cap how many live WebGL contexts one document may hold, and the answer cannot
// change within a page load, so the probe context is created once and the verdict reused.
// A probe per render would exhaust the cap and take the scene canvas down with it.
let probedBackend: RenderBackend | null = null

function canCreateWebGl2Context(): boolean {
  if (typeof document === 'undefined') {
    return false
  }
  try {
    // A runtime can carry the WebGL2RenderingContext constructor and still refuse a context
    // (a blocked GPU, WebGL switched off), so this asks for the context rather than the type.
    return Boolean(document.createElement('canvas').getContext('webgl2'))
  } catch {
    // Privacy-hardening extensions throw from getContext rather than returning null, to
    // defeat probes like this one. The probe runs during render and the application mounts
    // no error boundary, so a throw escaping here would blank the whole editor instead of
    // costing the user a 3D preview.
    return false
  }
}

function probeRenderBackend(): RenderBackend {
  // The API's presence is enough here; no adapter is requested, to keep the probe synchronous.
  if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
    return 'webgpu'
  }
  return canCreateWebGl2Context() ? 'webgl2' : 'unsupported'
}

/**
 * Reports the backend the live 3D preview will render through on this runtime.
 *
 * The answer is probed once and then cached for the life of the module, so a test that
 * renders a real consumer without mocking this module gets whichever runtime the first
 * caller in that file saw. Drive the answer with a module mock, or reload the module with
 * `vi.resetModules()` between cases.
 */
export function detectRenderBackend(): RenderBackend {
  probedBackend ??= probeRenderBackend()
  return probedBackend
}
