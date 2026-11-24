import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'

import { GROUND_GRASS_REFERENCE } from '../../core'
import { groundPlaneDrawsWith } from '../../engine'
import { Texture } from '../../engine/testing'
import { heldGrassAppearance, onlyGroundPlane } from './ground-plane-test-support'
import { useFramedScene } from './use-framed-scene'
import { framedSceneEnvironment } from './use-framed-scene-test-support'
import { useGroundTexture } from './use-ground-texture'
import type { TextureState } from './texture-cache'

vi.mock('./use-ground-texture')

afterEach(cleanup)

function showTexture(state: TextureState): void {
  vi.mocked(useGroundTexture).mockReturnValue(state)
}

describe('the framed scene hook loads the ground grass, seats it on the scene it already shows, and reports its status', () => {
  it('reports loading on a flat ground, then ready on the same scene drawing the grass', () => {
    const appearance = heldGrassAppearance(new Texture())
    showTexture({ status: 'loading' })
    const { result, rerender } = renderHook(() => useFramedScene(), {
      wrapper: framedSceneEnvironment().wrapper,
    })

    expect(result.current.groundTexture).toBe('loading')
    expect(groundPlaneDrawsWith(onlyGroundPlane(result.current.framed.root), undefined)).toBe(true)
    expect(useGroundTexture).toHaveBeenCalledWith(GROUND_GRASS_REFERENCE, expect.anything())

    const before = result.current.framed
    showTexture({ status: 'ready', appearance })
    rerender()

    expect(result.current.groundTexture).toBe('ready')
    expect(result.current.framed).toBe(before)
    expect(groundPlaneDrawsWith(onlyGroundPlane(result.current.framed.root), appearance)).toBe(true)
  })

  it('keeps drawing the grass after an overlay flip', () => {
    const appearance = heldGrassAppearance(new Texture())
    showTexture({ status: 'ready', appearance })
    const { result } = renderHook(() => useFramedScene(), {
      wrapper: framedSceneEnvironment().wrapper,
    })
    const before = result.current.framed

    act(() => result.current.toggleEdgeOverlay())

    expect(result.current.framed).not.toBe(before)
    expect(groundPlaneDrawsWith(onlyGroundPlane(result.current.framed.root), appearance)).toBe(true)
  })

  it('reports failed on a flat ground', () => {
    showTexture({ status: 'failed' })
    const { result } = renderHook(() => useFramedScene(), {
      wrapper: framedSceneEnvironment().wrapper,
    })

    expect(result.current.groundTexture).toBe('failed')
    expect(groundPlaneDrawsWith(onlyGroundPlane(result.current.framed.root), undefined)).toBe(true)
  })
})
