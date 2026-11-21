import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PLAN_DOWN, type ToneMappingOperator } from '../../core'
import { applyToneMappingOperator } from '../../engine'
import { SceneLighting } from './scene-lighting'
import { SceneRendererCanvas } from './scene-renderer-canvas'
import { defer, settle, type Deferred } from './scene-renderer-canvas-test-support'

// The real 3D library Canvas runs its real configure here, with the wrapper's own props, so the
// test sees the operator the library leaves on the renderer. Only the engine's renderer factory
// and lighting rigs are stand-ins: the factory returns a fake renderer, and the rigs are inert.
// The engine's applyToneMappingOperator stays real, and the test builds each expected value by
// running it, so the test needs no import of the 3D library (only engine/ imports it, ADR-0001).
const collaborators = vi.hoisted(() => ({
  factory: (() => ({})) as () => unknown,
}))

vi.mock('../../engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../engine')>()),
  loadSceneRendererFactory: () => Promise.resolve(() => collaborators.factory()),
  releaseSceneRenderer: () => Promise.resolve(),
  fitSunShadowToBounds: () => {},
  setLightingColor: () => {},
  // Class exports legitimately keep their PascalCase names in the mock.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  BasicLightingProvider: class {
    apply() {}
    update() {}
    dispose() {}
  },
  // eslint-disable-next-line @typescript-eslint/naming-convention
  SolarLightingProvider: class {
    apply() {}
    update() {}
    dispose() {}
  },
}))

// The library's identity operator (no tone mapping) is the constant 0.
const NO_TONE_MAPPING = 0
// The library's color-space names. Configure writes sRGB, and the fake renderer starts linear.
const SRGB_COLOR_SPACE = 'srgb'
const LINEAR_COLOR_SPACE = 'srgb-linear'

// The value the engine writes for a domain operator, read off a plain object.
function operatorValue(operator: ToneMappingOperator): number {
  const target: Parameters<typeof applyToneMappingOperator>[0] = { toneMapping: NO_TONE_MAPPING }
  applyToneMappingOperator(target, operator)
  return target.toneMapping
}

const CANVAS_SIZE = 64

interface ToneMappedRenderer {
  toneMapping: number
  outputColorSpace: string
  render: () => void
  setSize: () => void
  setPixelRatio: () => void
  shadowMap: { enabled: boolean; type: number }
  init: () => Promise<void>
}

// What the library's configure touches on a renderer: render() marks it as a renderer, and the
// rest is what it sizes and sets up. The tone mapping starts at Neutral, as the real factory
// seeds it, which is not the identity, so the identity after configure shows that the library wrote.
function buildFakeRenderer(started: Deferred<void>): ToneMappedRenderer {
  return {
    toneMapping: operatorValue('neutral'),
    outputColorSpace: LINEAR_COLOR_SPACE,
    render: () => {},
    setSize: () => {},
    setPixelRatio: () => {},
    shadowMap: { enabled: false, type: 0 },
    init: () => started.promise,
  }
}

// jsdom has no layout. The library's Canvas configures only once its container measures larger
// than zero, so the observer fires on observe and the container reports a fixed size.
function installLayout(): void {
  class FakeResizeObserver {
    constructor(private readonly callback: () => void) {}
    observe() {
      this.callback()
    }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: CANVAS_SIZE,
    bottom: CANVAS_SIZE,
    width: CANVAS_SIZE,
    height: CANVAS_SIZE,
    toJSON: () => ({}),
  })
}

interface LightingModeCase {
  mode: string
  realistic: boolean
  colorCheck: boolean
  operator: ToneMappingOperator
}

function mountCanvas(lighting: Pick<LightingModeCase, 'realistic' | 'colorCheck'>) {
  const ui = (position: [number, number, number]) => (
    <SceneRendererCanvas camera={{ position }}>
      <SceneLighting
        colorTemperatureK={6500}
        bounds={null}
        site={undefined}
        front={PLAN_DOWN}
        realistic={lighting.realistic}
        colorCheck={lighting.colorCheck}
      />
    </SceneRendererCanvas>
  )
  const view = render(ui([0, 0, 1]))
  return { again: () => view.rerender(ui([0, 0, 2])) }
}

describe('the scene canvas tone-mapping operator', () => {
  let renderer: ToneMappedRenderer
  let started: Deferred<void>

  beforeEach(() => {
    installLayout()
    started = defer<void>()
    renderer = buildFakeRenderer(started)
    collaborators.factory = () => renderer
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('is left as the identity by the 3D library, which does not pick an operator of its own', async () => {
    mountCanvas({ realistic: false, colorCheck: false })

    await vi.waitFor(() => expect(renderer.outputColorSpace).toBe(SRGB_COLOR_SPACE))

    expect(renderer.toneMapping).toBe(NO_TONE_MAPPING)
    expect(renderer.toneMapping).not.toBe(operatorValue('agx'))
    expect(renderer.toneMapping).not.toBe(operatorValue('neutral'))
  })

  it.each<LightingModeCase>([
    { mode: 'schematic', realistic: false, colorCheck: false, operator: 'neutral' },
    { mode: 'realistic', realistic: true, colorCheck: false, operator: 'agx' },
    {
      mode: 'realistic with the color check',
      realistic: true,
      colorCheck: true,
      operator: 'neutral',
    },
  ])(
    'is the $mode operator once the canvas mounts and after it renders again',
    async ({ realistic, colorCheck, operator }) => {
      const { again } = mountCanvas({ realistic, colorCheck })
      await vi.waitFor(() => expect(renderer.outputColorSpace).toBe(SRGB_COLOR_SPACE))

      await settle(() => started.resolve())
      expect(renderer.toneMapping).toBe(operatorValue(operator))

      again()
      await settle(() => {})
      expect(renderer.toneMapping).toBe(operatorValue(operator))
    },
  )
})
