import { describe, it, expect, afterEach, vi } from 'vitest'
import { detectRenderBackend } from './detect-backend'

describe('detectRenderBackend', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports webgpu when the runtime exposes a gpu', () => {
    vi.stubGlobal('navigator', { gpu: {} })
    expect(detectRenderBackend()).toBe('webgpu')
  })

  it('reports unsupported when the runtime has no gpu', () => {
    vi.stubGlobal('navigator', {})
    expect(detectRenderBackend()).toBe('unsupported')
  })
})
