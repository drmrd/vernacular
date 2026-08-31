import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import {
  useUnderlay,
  commitCalibration,
  usePlanUnderlayLayer,
  UnderlayProvider,
  type UnderlayContextValue,
  type CalibrationCommit,
  type PlanUnderlayLayer,
} from './use-underlay'
import {
  ActiveFloorProvider,
  EditorSessionProvider,
  createActiveFloorStore,
  type EditorSession,
} from '../../bridge'
import { ActiveToolProvider } from '../tools/active-tool-provider'
import { CALIBRATE_UNDERLAY, type SceneGraph, type UnderlaySceneNode } from '../../core'
import type { Viewport } from './viewport'

afterEach(cleanup)

function Probe({ onValue }: { onValue: (value: UnderlayContextValue) => void }) {
  onValue(useUnderlay())
  return null
}

describe('useUnderlay context value', () => {
  it('omits trace-mode controls now that underlay-corner snapping is a snap preference', () => {
    let captured: UnderlayContextValue | undefined
    render(<Probe onValue={(value) => (captured = value)} />)

    const value = captured as UnderlayContextValue
    expect('traceMode' in value).toBe(false)
    expect('setTraceMode' in value).toBe(false)
  })

  it('exposes the entered known-distance text as context state defaulting to an empty string', () => {
    let captured: UnderlayContextValue | undefined
    render(<Probe onValue={(value) => (captured = value)} />)

    const value = captured as UnderlayContextValue
    expect(value.knownDistanceText).toBe('')
    expect(typeof value.setKnownDistanceText).toBe('function')
  })
})

const ARMED_ID = 'a'

function calibrationGraph(): SceneGraph {
  const node: UnderlaySceneNode = {
    id: `underlay:${ARMED_ID}`,
    kind: 'underlay',
    floorId: 'f',
    source: { kind: 'raster', image: { scope: 'project', contentHash: 'sha256-abc' } },
    width: 800,
    height: 600,
    placement: { offset: { x: 1000, y: 500 }, millimetersPerPixel: 10, rotation: 0 },
    opacity: 1,
    visible: true,
  }
  return {
    nodes: [],
    walls: [],
    rooms: [],
    underlays: [node],
    openings: [],
    dimensions: [],
    stairs: [],
    furniture: [],
  }
}

// Two world points one calibration segment apart; the exact geometry is
// irrelevant here, only that commitCalibration consumes the supplied known
// distance text rather than reaching for window.prompt.
const segment = { start: { x: 1200, y: 500 }, end: { x: 1700, y: 500 } }

describe('commitCalibration consumes the entered known distance', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('dispatches a calibration command derived from the supplied known-distance text without prompting', () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null)
    const dispatch = vi.fn()
    const session = { dispatch } as unknown as CalibrationCommit['session']

    commitCalibration(segment, {
      session,
      graph: calibrationGraph(),
      armedUnderlayId: ARMED_ID,
      units: 'metric',
      knownDistanceText: '3 m',
    })

    expect(dispatch).toHaveBeenCalledTimes(1)
    const command = dispatch.mock.calls[0]![0] as {
      type: unknown
      params: { floorId: unknown; underlayId: unknown; placement: unknown }
    }
    expect(command.type).toBe(CALIBRATE_UNDERLAY)
    expect(command.params.floorId).toBe('f')
    expect(command.params.underlayId).toBe('a')
    expect(typeof command.params.placement).toBe('object')
    expect(promptSpy).not.toHaveBeenCalled()
  })

  it('dispatches nothing when the supplied known-distance text is blank, and never prompts', () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null)
    const dispatch = vi.fn()
    const session = { dispatch } as unknown as CalibrationCommit['session']

    commitCalibration(segment, {
      session,
      graph: calibrationGraph(),
      armedUnderlayId: ARMED_ID,
      units: 'metric',
      knownDistanceText: '',
    })

    expect(dispatch).not.toHaveBeenCalled()
    expect(promptSpy).not.toHaveBeenCalled()
  })
})

const FLOOR_ID = 'f'
const VIEWPORT: Viewport = { scale: 1, offset: { x: 0, y: 0 } }

// Two clicks in canvas pixels. At scale 1 with no offset a click maps to world
// { x, -y }, and the pair is far enough apart to measure a real distance.
const FIRST_CLICK = { x: 1200, y: 500 }
const SECOND_CLICK = { x: 1700, y: 500 }

// jsdom reports a zero-sized canvas, which would divide the click-to-canvas
// conversion by zero; pin the rect to the canvas's own pixel size so a click
// maps one to one.
function canvasAtOrigin(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: canvas.width, height: canvas.height }) as DOMRect
  return canvas
}

function clickAt(at: { x: number; y: number }) {
  return {
    clientX: at.x,
    clientY: at.y,
    currentTarget: canvasAtOrigin(),
  } as unknown as Parameters<PlanUnderlayLayer['calibration']['onPointerDown']>[0]
}

interface CalibrationHarness {
  underlay: UnderlayContextValue
  layer: PlanUnderlayLayer
}

function HarnessProbe({
  session,
  graph,
  onValue,
}: {
  session: EditorSession
  graph: SceneGraph
  onValue: (value: CalibrationHarness) => void
}) {
  const underlay = useUnderlay()
  const layer = usePlanUnderlayLayer({
    session,
    graph,
    tool: 'calibrate',
    viewport: VIEWPORT,
    activeFloorId: FLOOR_ID,
  })
  onValue({ underlay, layer })
  return null
}

// Arms the calibration against the underlay and enters a known distance, the
// state a user is in when they take the first of the two calibration clicks.
function mountArmedCalibration() {
  const dispatch = vi.fn()
  const graph = calibrationGraph()
  const session = {
    dispatch,
    subscribe: () => () => {},
    getSceneGraph: () => graph,
    getProject: () => ({ floors: [{ id: FLOOR_ID }], meta: { units: 'metric' } }),
  } as unknown as EditorSession
  let harness: CalibrationHarness | undefined
  render(
    <EditorSessionProvider session={session}>
      <ActiveFloorProvider store={createActiveFloorStore(FLOOR_ID)}>
        <ActiveToolProvider initialTool="calibrate">
          <UnderlayProvider>
            <HarnessProbe
              session={session}
              graph={graph}
              onValue={(value) => {
                harness = value
              }}
            />
          </UnderlayProvider>
        </ActiveToolProvider>
      </ActiveFloorProvider>
    </EditorSessionProvider>,
  )
  const current = (): CalibrationHarness => harness as CalibrationHarness
  act(() => {
    current().underlay.startCalibration(ARMED_ID)
    current().underlay.setKnownDistanceText('3 m')
  })
  return { dispatch, current }
}

describe('a committed calibration disarms the underlay', () => {
  it('clears the armed underlay once the second click has dispatched the new scale', () => {
    const { dispatch, current } = mountArmedCalibration()

    act(() => {
      current().layer.calibration.onPointerDown(clickAt(FIRST_CLICK))
    })
    act(() => {
      current().layer.calibration.onPointerDown(clickAt(SECOND_CLICK))
    })

    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(current().underlay.armedUnderlayId).toBe(null)
  })
})
