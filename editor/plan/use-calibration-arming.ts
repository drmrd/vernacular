import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ActiveToolValue, ToolId } from '../tools/active-tool-context'
import { IDLE_CALIBRATION_TOOL, type CalibrationToolState } from './calibration-tool'
import { claimKeystroke, ownsKeystroke } from './keyboard-guard'

/** Everything the calibration arming owns: the armed underlay, the two-click
 *  measurement, and the distance entered against it. */
export interface CalibrationArming {
  /** Arm the calibration tool against a specific underlay and switch the active tool to 'calibrate'. */
  startCalibration: (underlayId: string) => void
  /** Disarm the calibration tool, leaving no underlay targeted. */
  stopCalibration: () => void
  /** The underlay id the calibration tool currently targets, or null when nothing is armed. */
  armedUnderlayId: string | null
  /** The two-click calibration measurement state. */
  calibrationToolState: CalibrationToolState
  setCalibrationToolState: (state: CalibrationToolState) => void
  /** The known real-world distance the user has entered for the armed calibration, empty when none. */
  knownDistanceText: string
  setKnownDistanceText: (text: string) => void
}

/**
 * The ladder's first rung for the pointer half of a calibration: Escape abandons a
 * measurement whose first click is already down, claims the keystroke so the tool
 * stays armed, and leaves an Escape at rest to the rung that returns to select. The
 * entered known distance is untouched, so the flyout keeps what the user typed.
 *
 * The measurement is read through a ref refreshed every render, so the window
 * listener subscribes once per tool change rather than on every render, as in the
 * wall and dimension tools. A render-scoped subscription would re-add the listener
 * mid-keystroke whenever a sibling hook updates state inside the same keydown, and
 * the DOM drops a listener re-added during dispatch, which would swallow the cancel.
 * setToolState comes from useState, so it is stable and never re-subscribes.
 */
function useCalibrationCancel(
  tool: ToolId,
  toolState: CalibrationToolState,
  setToolState: (state: CalibrationToolState) => void,
): void {
  const measurementRef = useRef(toolState)
  measurementRef.current = toolState
  useEffect(() => {
    if (tool !== 'calibrate') {
      return undefined
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || ownsKeystroke(event.target, event.key)) {
        return
      }
      if (measurementRef.current.phase === 'measuring') {
        claimKeystroke(event)
        setToolState(IDLE_CALIBRATION_TOOL)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [tool, setToolState])
}

export function useCalibrationArming(activeTool: ActiveToolValue): CalibrationArming {
  const [armedUnderlayId, setArmedUnderlayId] = useState<string | null>(null)
  const [calibrationToolState, setCalibrationToolState] =
    useState<CalibrationToolState>(IDLE_CALIBRATION_TOOL)
  const [knownDistanceText, setKnownDistanceText] = useState('')
  const { setTool } = activeTool
  useCalibrationCancel(activeTool.tool, calibrationToolState, setCalibrationToolState)

  const startCalibration = useCallback(
    (underlayId: string) => {
      setArmedUnderlayId(underlayId)
      setCalibrationToolState(IDLE_CALIBRATION_TOOL)
      setKnownDistanceText('')
      setTool('calibrate')
    },
    [setTool],
  )

  const stopCalibration = useCallback(() => setArmedUnderlayId(null), [])

  // Memoize the bundle so consumers (the provider's context-value memo) see a
  // stable reference across renders that do not change the armed underlay or the
  // measurement state. setCalibrationToolState, setKnownDistanceText,
  // startCalibration, and stopCalibration are stable.
  return useMemo(
    () => ({
      armedUnderlayId,
      calibrationToolState,
      setCalibrationToolState,
      knownDistanceText,
      setKnownDistanceText,
      startCalibration,
      stopCalibration,
    }),
    [armedUnderlayId, calibrationToolState, knownDistanceText, startCalibration, stopCalibration],
  )
}
