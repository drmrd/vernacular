import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import {
  useUnderlay,
  commitCalibration,
  type UnderlayContextValue,
  type CalibrationCommit,
} from './use-underlay'
import { CALIBRATE_UNDERLAY, type SceneGraph, type UnderlaySceneNode } from '../../core'

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
