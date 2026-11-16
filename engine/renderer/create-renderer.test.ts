import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NeutralToneMapping, PCFSoftShadowMap, SRGBColorSpace } from 'three'
import type { SceneRendererFactory, SceneRendererOptions } from './create-renderer'

// The mock counts the init() calls the fake renderer receives.
const fake = vi.hoisted(() => ({ initCalls: 0 }))

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
      fake.initCalls += 1
    }
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention -- the key mirrors three's exported class name
  return { ...actual, WebGPURenderer: FakeWebGPURenderer }
})

interface FakeRenderer {
  shadowMap: { type?: unknown }
  outputColorSpace: unknown
  toneMapping: unknown
  toneMappingExposure: number
}

// The module caches its load at module level, so each case imports a fresh copy.
async function freshModule() {
  vi.resetModules()
  return import('./create-renderer')
}

async function constructRenderer(options?: SceneRendererOptions): Promise<FakeRenderer> {
  const { loadSceneRendererFactory } = await freshModule()
  const factory: SceneRendererFactory = await loadSceneRendererFactory()
  return factory(options) as unknown as FakeRenderer
}

describe('loadSceneRendererFactory', () => {
  beforeEach(() => {
    fake.initCalls = 0
  })

  afterEach(() => {
    vi.doUnmock('three/webgpu')
  })

  it('renders into sRGB output with Khronos PBR Neutral tone mapping', async () => {
    const renderer = await constructRenderer({})

    expect(renderer.outputColorSpace).toBe(SRGBColorSpace)
    expect(renderer.toneMapping).toBe(NeutralToneMapping)
  })

  it('uses soft PCF shadow maps', async () => {
    const renderer = await constructRenderer({})

    expect(renderer.shadowMap.type).toBe(PCFSoftShadowMap)
  })

  it('defaults the tone-mapping exposure to 1', async () => {
    const renderer = await constructRenderer({})

    expect(renderer.toneMappingExposure).toBe(1)
  })

  it('honors a caller-supplied tone-mapping exposure', async () => {
    const renderer = await constructRenderer({ toneMappingExposure: 0.8 })

    expect(renderer.toneMappingExposure).toBe(0.8)
  })

  it('does not initialize the renderer backend', async () => {
    await constructRenderer({})

    expect(fake.initCalls).toBe(0)
  })

  it('returns the same promise for every call, so the module loads once', async () => {
    const { loadSceneRendererFactory } = await freshModule()

    expect(loadSceneRendererFactory()).toBe(loadSceneRendererFactory())
  })

  it('does not keep a failed module load, so the next call tries again', async () => {
    const { loadSceneRendererFactory } = await freshModule()
    vi.doMock('three/webgpu', () => {
      throw new Error('the renderer chunk failed to load')
    })

    await expect(loadSceneRendererFactory()).rejects.toThrow()
    /* eslint-disable @typescript-eslint/naming-convention -- the keys mirror three's exported names */
    vi.doMock('three/webgpu', () => ({
      WebGPURenderer: class {},
      PCFSoftShadowMap,
      SRGBColorSpace,
    }))
    /* eslint-enable @typescript-eslint/naming-convention */
    const factory = await loadSceneRendererFactory()

    expect(typeof factory).toBe('function')
  })
})
