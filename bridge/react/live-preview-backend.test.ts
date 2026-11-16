import { describe, it, expect, afterEach, vi } from 'vitest'
// Loads the module under test once while the file is collected, where no test timeout
// applies. Its first load transforms the engine and core barrels (about 220 modules) and
// loads three and ajv: about 1.3 s alone, and 4 to 5 s when this file starts among the
// first files of a busy run, which timed out the first case. Each case below still loads
// a fresh copy through vi.resetModules(), which now costs tens of milliseconds.
import './live-preview-backend'

// The probe answers once per page load and reuses the answer, so every case
// loads a fresh copy of the module against the runtime it just stubbed.
async function detectBackend(): Promise<string> {
  vi.resetModules()
  const { detectLivePreviewBackend } = await import('./live-preview-backend')
  return detectLivePreviewBackend()
}

// Stands in for the browser's canvas context lookup. jsdom has no WebGL, and its
// own getContext reports "not implemented" rather than returning null, so every
// case that cares about the WebGL 2 answer states it here.
function stubWebGl2Context(context: unknown): void {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((contextId: string) =>
    contextId === 'webgl2' ? context : null) as never)
}

describe('detectLivePreviewBackend', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('reports WebGPU when the runtime exposes an adapter', async () => {
    vi.stubGlobal('navigator', { gpu: {} })
    stubWebGl2Context({})

    expect(await detectBackend()).toBe('webgpu')
  })

  it('reports WebGL 2 when WebGPU is absent but a WebGL 2 context is available', async () => {
    vi.stubGlobal('navigator', {})
    stubWebGl2Context({})

    expect(await detectBackend()).toBe('webgl2')
  })

  it('reports the preview unsupported when neither backend is available', async () => {
    vi.stubGlobal('navigator', {})
    stubWebGl2Context(null)

    expect(await detectBackend()).toBe('unsupported')
  })

  it('reports the preview unsupported when the context probe throws', async () => {
    vi.stubGlobal('navigator', {})
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => {
      throw new Error('context creation blocked')
    }) as never)

    // Privacy-hardening extensions throw from getContext rather than returning null,
    // precisely to defeat probes like this one. The probe runs during render and the
    // application mounts no error boundary, so a throw escaping here would blank the
    // whole editor rather than costing the user a 3D preview.
    expect(await detectBackend()).toBe('unsupported')
  })

  it('creates at most one probe context however often it is asked', async () => {
    vi.stubGlobal('navigator', {})
    stubWebGl2Context({})
    vi.resetModules()
    const { detectLivePreviewBackend } = await import('./live-preview-backend')

    detectLivePreviewBackend()
    detectLivePreviewBackend()
    detectLivePreviewBackend()

    // A live 3D view renders many times, and browsers cap the number of live
    // WebGL contexts a document may hold. A probe context per render would
    // exhaust that cap and take the real scene canvas down with it.
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledTimes(1)
  })
})
