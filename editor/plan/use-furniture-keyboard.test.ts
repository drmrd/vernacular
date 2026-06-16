import { afterEach, describe, it, expect, vi } from 'vitest'
import { renderHook, cleanup } from '@testing-library/react'
import { useFurnitureKeyboard } from './use-furniture-keyboard'

afterEach(cleanup)

function dispatchWindowKey(key: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key }))
}

describe('useFurnitureKeyboard', () => {
  it('rotates the placement ghost on the R key while the place-furniture tool is active', () => {
    const rotateArmed = vi.fn()
    renderHook(() => useFurnitureKeyboard({ tool: 'place-furniture', rotateArmed }))

    dispatchWindowKey('r')

    expect(rotateArmed).toHaveBeenCalledTimes(1)
  })

  it('ignores the R key while a non-place-furniture tool is active', () => {
    const rotateArmed = vi.fn()
    renderHook(() => useFurnitureKeyboard({ tool: 'select', rotateArmed }))

    dispatchWindowKey('r')

    expect(rotateArmed).not.toHaveBeenCalled()
  })

  it('rotates on an uppercase R while the place-furniture tool is active', () => {
    const rotateArmed = vi.fn()
    renderHook(() => useFurnitureKeyboard({ tool: 'place-furniture', rotateArmed }))

    dispatchWindowKey('R')

    expect(rotateArmed).toHaveBeenCalledTimes(1)
  })

  it('ignores the R key while a form control is focused', () => {
    const rotateArmed = vi.fn()
    renderHook(() => useFurnitureKeyboard({ tool: 'place-furniture', rotateArmed }))

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }))
    input.remove()

    expect(rotateArmed).not.toHaveBeenCalled()
  })

  it('stops responding to the R key after the hook unmounts', () => {
    const rotateArmed = vi.fn()
    const { unmount } = renderHook(() =>
      useFurnitureKeyboard({ tool: 'place-furniture', rotateArmed }),
    )

    unmount()
    dispatchWindowKey('r')

    expect(rotateArmed).not.toHaveBeenCalled()
  })
})
