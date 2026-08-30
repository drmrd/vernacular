import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { CameraPose } from '../../core'
import { useSceneNavigation } from './use-scene-navigation'

const SOME_POSE: CameraPose = {
  position: { x: 1, y: 2, z: 3 },
  target: { x: 0, y: 0, z: 0 },
  near: 0.1,
  far: 100,
}

describe('useSceneNavigation', () => {
  it('reports no applied preset pose for a fresh navigation, so the camera pivots on the model framing', () => {
    const { result } = renderHook(() => useSceneNavigation())

    expect(result.current.presetPose).toBeNull()
  })

  it('exposes a noted preset pose as the pose the camera now pivots on', () => {
    const { result } = renderHook(() => useSceneNavigation())

    act(() => {
      result.current.notePresetApplied(SOME_POSE)
    })

    expect(result.current.presetPose).toEqual(SOME_POSE)
  })

  it('clears the recorded preset pose on reset, so the pivot returns to the model framing', () => {
    const { result } = renderHook(() => useSceneNavigation())

    act(() => {
      result.current.notePresetApplied(SOME_POSE)
    })
    act(() => {
      result.current.resetView()
    })

    expect(result.current.presetPose).toBeNull()
  })

  it('takes camera control and requests the named preset when a preset is applied', () => {
    const { result } = renderHook(() => useSceneNavigation())

    act(() => {
      result.current.applyPreset('north')
    })

    expect(result.current.userControlled).toBe(true)
    expect(result.current.presetRequest?.preset).toBe('north')
  })

  it('issues a fresh request nonce when the same preset is re-picked, so the camera snaps again', () => {
    const { result } = renderHook(() => useSceneNavigation())

    act(() => {
      result.current.applyPreset('north')
    })
    const firstNonce = result.current.presetRequest?.nonce

    act(() => {
      result.current.applyPreset('north')
    })

    expect(result.current.presetRequest?.preset).toBe('north')
    expect(result.current.presetRequest?.nonce).not.toBe(firstNonce)
  })

  it('enables click selection for a freshly mounted navigation, so a first click can select something', () => {
    const { result } = renderHook(() => useSceneNavigation())

    expect(result.current.selectionEnabled).toBe(true)
  })
})
