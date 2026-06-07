import { describe, it, expect } from 'vitest'
import { advanceCalibrationTool, IDLE_CALIBRATION_TOOL } from './calibration-tool'

describe('advanceCalibrationTool', () => {
  it('records the start on the first click without emitting a segment', () => {
    const result = advanceCalibrationTool(IDLE_CALIBRATION_TOOL, { x: 100, y: 100 })

    expect(result.state).toEqual({ phase: 'measuring', start: { x: 100, y: 100 } })
    expect(result.segment).toBeUndefined()
  })

  it('completes the segment and returns to idle on the second click', () => {
    const measuring = advanceCalibrationTool(IDLE_CALIBRATION_TOOL, { x: 100, y: 100 }).state
    const result = advanceCalibrationTool(measuring, { x: 500, y: 100 })

    expect(result.state).toEqual(IDLE_CALIBRATION_TOOL)
    expect(result.segment).toEqual({ start: { x: 100, y: 100 }, end: { x: 500, y: 100 } })
  })

  it('cancels a zero-length measurement back to idle without emitting a segment', () => {
    const measuring = advanceCalibrationTool(IDLE_CALIBRATION_TOOL, { x: 100, y: 100 }).state
    const result = advanceCalibrationTool(measuring, { x: 100, y: 100 })

    expect(result.state).toEqual(IDLE_CALIBRATION_TOOL)
    expect(result.segment).toBeUndefined()
  })
})
