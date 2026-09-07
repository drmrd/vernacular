import { describe, it, expect, afterEach, vi } from 'vitest'

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
