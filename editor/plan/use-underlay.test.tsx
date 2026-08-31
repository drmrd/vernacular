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

const KNOWN_DISTANCE = '3 m'
const BLANK_DISTANCE = ''
const UNPARSEABLE_DISTANCE = 'abc'

// The armed underlay has been deleted (or never landed in the graph) by the
// time the second calibration click arrives.
function graphMissingTheArmedUnderlay(): SceneGraph {
  return { ...calibrationGraph(), underlays: [] }
}

// Commits one calibration and hands back the two effects a user can observe:
// what was dispatched and what they were told.
function attemptCalibration(graph: SceneGraph, knownDistanceText: string) {
  const dispatch = vi.fn()
  const notify = vi.fn()
  const session = { dispatch } as unknown as CalibrationCommit['session']

  const committed = commitCalibration(segment, {
    session,
    graph,
    armedUnderlayId: ARMED_ID,
    units: 'metric',
    knownDistanceText,
    notify,
  })

  return { dispatch, notify, committed }
}

describe('commitCalibration consumes the entered known distance', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('dispatches a calibration command derived from the supplied known-distance text without prompting', () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null)

    const { dispatch, notify, committed } = attemptCalibration(calibrationGraph(), KNOWN_DISTANCE)

    expect(committed).toBe(true)
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
    expect(notify).not.toHaveBeenCalled()
  })

  it('tells the user the known distance is missing when the supplied text is blank, and never prompts', () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null)

    const { dispatch, notify, committed } = attemptCalibration(calibrationGraph(), BLANK_DISTANCE)

    expect(committed).toBe(false)
    expect(dispatch).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/known distance/i))
    expect(promptSpy).not.toHaveBeenCalled()
  })

  it('tells the user the known distance is unreadable when the supplied text is not a length', () => {
    const { dispatch, notify, committed } = attemptCalibration(
      calibrationGraph(),
      UNPARSEABLE_DISTANCE,
    )

    expect(committed).toBe(false)
    expect(dispatch).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/known distance/i))
  })

  it('tells the user the underlay is gone when the graph holds no node for the armed id', () => {
    const { dispatch, notify, committed } = attemptCalibration(
      graphMissingTheArmedUnderlay(),
      KNOWN_DISTANCE,
    )

    expect(committed).toBe(false)
    expect(dispatch).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/underlay/i))
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
  notify,
  onValue,
}: {
  session: EditorSession
  graph: SceneGraph
  notify: (message: string) => void
  onValue: (value: CalibrationHarness) => void
}) {
  const underlay = useUnderlay()
  const layer = usePlanUnderlayLayer({
    session,
    graph,
    tool: 'calibrate',
    viewport: VIEWPORT,
    activeFloorId: FLOOR_ID,
    notify,
  })
  onValue({ underlay, layer })
  return null
}

// Arms the calibration against the underlay and enters a known distance, the
// state a user is in when they take the first of the two calibration clicks.
function mountArmedCalibration(knownDistanceText: string = KNOWN_DISTANCE) {
  const dispatch = vi.fn()
  const notify = vi.fn()
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
              notify={notify}
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
    current().underlay.setKnownDistanceText(knownDistanceText)
  })
  return { dispatch, notify, current }
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

describe('a calibration that cannot commit stays armed', () => {
  it('reports the missing known distance on the second click and leaves the underlay armed', () => {
    const { dispatch, notify, current } = mountArmedCalibration(BLANK_DISTANCE)

    act(() => {
      current().layer.calibration.onPointerDown(clickAt(FIRST_CLICK))
    })
    act(() => {
      current().layer.calibration.onPointerDown(clickAt(SECOND_CLICK))
    })

    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/known distance/i))
    expect(dispatch).not.toHaveBeenCalled()
    expect(current().underlay.armedUnderlayId).toBe(ARMED_ID)
  })
})
