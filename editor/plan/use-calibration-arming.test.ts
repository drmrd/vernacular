import { afterEach, describe, it, expect, vi } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import type { ActiveToolValue, ToolId } from '../tools/active-tool-context'
import { IDLE_CALIBRATION_TOOL, type CalibrationToolState } from './calibration-tool'
import { wasKeystrokeClaimed } from './keyboard-guard'
import { useCalibrationArming } from './use-underlay'

afterEach(cleanup)

const HALF_TAKEN: CalibrationToolState = { phase: 'measuring', start: { x: 1200, y: -800 } }

function activeTool(tool: ToolId): ActiveToolValue {
  return { tool, setTool: vi.fn() }
}

// Escape is settled once every listener on the keystroke has had its say, so the
// press is flushed before the claim is read.
async function pressEscape(): Promise<KeyboardEvent> {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
  await act(async () => {
    window.dispatchEvent(event)
  })
  return event
}

function armedCalibration(tool: ToolId = 'calibrate') {
  const view = renderHook(() => useCalibrationArming(activeTool(tool)))
  const startMeasuring = (): void => {
    act(() => {
      view.result.current.setCalibrationToolState(HALF_TAKEN)
    })
  }
  return { view, startMeasuring }
}

describe('useCalibrationArming', () => {
  it('clears any previously-entered known distance when a calibration is armed', () => {
    const { view } = armedCalibration()

    act(() => {
      view.result.current.setKnownDistanceText('3 m')
    })
    expect(view.result.current.knownDistanceText).toBe('3 m')

    act(() => {
      view.result.current.startCalibration('underlay-x')
    })

    expect(view.result.current.knownDistanceText).toBe('')
  })

  // The underlay panel is the only way into the calibrate tool, so arming is where
  // a measurement left over from an earlier one is discarded. Pinned here rather
  // than fixed: this half already held.
  it('discards a measurement an earlier arming left half taken', () => {
    const { view, startMeasuring } = armedCalibration()
    startMeasuring()

    act(() => {
      view.result.current.startCalibration('underlay-x')
    })

    expect(view.result.current.calibrationToolState).toEqual(IDLE_CALIBRATION_TOOL)
  })
})

describe('useCalibrationArming cancels a pointer calibration on Escape', () => {
  it('drops the first click and claims the keystroke, so the tool stays armed', async () => {
    const { view, startMeasuring } = armedCalibration()
    startMeasuring()

    const event = await pressEscape()

    expect(wasKeystrokeClaimed(event)).toBe(true)
    expect(view.result.current.calibrationToolState).toEqual(IDLE_CALIBRATION_TOOL)
  })

  it('leaves the entered known distance alone, so the flyout keeps what was typed', async () => {
    const { view, startMeasuring } = armedCalibration()
    act(() => {
      view.result.current.setKnownDistanceText('3 m')
    })
    startMeasuring()

    await pressEscape()

    expect(view.result.current.knownDistanceText).toBe('3 m')
  })

  it('leaves Escape unclaimed when no calibration is half taken, so the ladder moves on', async () => {
    armedCalibration()

    const event = await pressEscape()

    expect(wasKeystrokeClaimed(event)).toBe(false)
  })

  it('ignores Escape under another tool, where the calibration is not the run in progress', async () => {
    const { view, startMeasuring } = armedCalibration('select')
    startMeasuring()

    const event = await pressEscape()

    expect(wasKeystrokeClaimed(event)).toBe(false)
    expect(view.result.current.calibrationToolState).toEqual(HALF_TAKEN)
  })
})
