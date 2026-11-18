import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { isComposingKey } from './composing-key'

afterEach(cleanup)

// Some engines report a key of a composition as key code 229 instead of isComposing.
const COMPOSITION_KEY_CODE = 229

function keydown(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', init)
}

describe('isComposingKey on a DOM keyboard event', () => {
  it('is true for a key that the browser marks as part of a composition', () => {
    expect(isComposingKey(keydown({ key: 'Enter', isComposing: true }))).toBe(true)
  })

  it('is true for the legacy composition key code even when isComposing is false', () => {
    const event = keydown({ key: 'Process', keyCode: COMPOSITION_KEY_CODE, isComposing: false })

    expect(isComposingKey(event)).toBe(true)
  })

  it('is false for a plain Enter, a plain Escape, and a plain letter', () => {
    expect(isComposingKey(keydown({ key: 'Enter' }))).toBe(false)
    expect(isComposingKey(keydown({ key: 'Escape' }))).toBe(false)
    expect(isComposingKey(keydown({ key: 'a' }))).toBe(false)
  })

  it('carries isComposing from the event init to the event in jsdom', () => {
    expect(keydown({ key: 'Enter', isComposing: true }).isComposing).toBe(true)
  })
})

describe('isComposingKey on a React keyboard event', () => {
  function renderProbe() {
    const seen: boolean[] = []
    render(
      <input
        aria-label="Probe"
        onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
          seen.push(isComposingKey(event))
        }}
      />,
    )
    return { field: screen.getByRole('textbox', { name: 'Probe' }), seen }
  }

  it('is true for a key that the browser marks as part of a composition', () => {
    const { field, seen } = renderProbe()

    fireEvent.keyDown(field, { key: 'Enter', isComposing: true })

    expect(seen).toEqual([true])
  })

  it('is false for a plain key', () => {
    const { field, seen } = renderProbe()

    fireEvent.keyDown(field, { key: 'Enter' })

    expect(seen).toEqual([false])
  })
})
