import { describe, expect, it, vi } from 'vitest'
import { NeutralToneMapping, SRGBColorSpace } from 'three'
import { createSceneRenderer, type SceneRendererOptions } from './create-renderer'

// jsdom has no GPU, so the three/webgpu boundary is mocked rather than the factory
// under test. Spreading the actual 'three' module keeps every constant the factory
// destructures (shadow-map modes, tone-mapping modes, color spaces) real, while the
// fake renderer class only records the configuration the factory applies to it.
vi.mock('three/webgpu', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('three')

  class FakeWebGPURenderer {
    readonly options: Record<string, unknown>
    shadowMap: Record<string, unknown> = {}

    constructor(options: Record<string, unknown>) {
      this.options = options
    }

    async init(): Promise<void> {
      // The real renderer negotiates a GPU backend here; the fake needs none.
    }
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention -- the key mirrors three's exported class name
  return { ...actual, WebGPURenderer: FakeWebGPURenderer }
})

describe('createSceneRenderer', () => {
  it('renders into sRGB output with Khronos PBR Neutral tone mapping', async () => {
    const renderer = await createSceneRenderer({})

    expect(renderer.outputColorSpace).toBe(SRGBColorSpace)
    expect(renderer.toneMapping).toBe(NeutralToneMapping)
  })

  it('defaults the tone-mapping exposure to 1', async () => {
    const renderer = await createSceneRenderer({})

    expect(renderer.toneMappingExposure).toBe(1)
  })

  it('honors a caller-supplied tone-mapping exposure', async () => {
    const renderer = await createSceneRenderer({
      toneMappingExposure: 0.8,
    } as SceneRendererOptions)

    expect(renderer.toneMappingExposure).toBe(0.8)
  })
})
