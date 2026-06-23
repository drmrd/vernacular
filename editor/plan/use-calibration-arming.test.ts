import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ActiveToolValue } from '../tools/active-tool-context'
import { useCalibrationArming } from './use-underlay'

describe('useCalibrationArming', () => {
  it('clears any previously-entered known distance when a calibration is armed', () => {
    const activeTool = { setTool: vi.fn() } as unknown as ActiveToolValue

    const { result } = renderHook(() => useCalibrationArming(activeTool))

    act(() => {
      result.current.setKnownDistanceText('3 m')
    })
    expect(result.current.knownDistanceText).toBe('3 m')

    act(() => {
      result.current.startCalibration('underlay-x')
    })
    expect(result.current.knownDistanceText).toBe('')
  })
})
