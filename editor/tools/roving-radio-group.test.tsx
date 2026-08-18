import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRovingRadioGroup } from './roving-radio-group'

afterEach(cleanup)

function ToolRadios() {
  const { containerRef, onKeyDown } = useRovingRadioGroup<HTMLDivElement>()
  return (
    <div ref={containerRef} role="radiogroup" aria-label="Tools" onKeyDown={onKeyDown}>
      <button type="button" role="radio" aria-checked="true" tabIndex={0}>
        Select
      </button>
      <button type="button" role="radio" aria-checked="false" tabIndex={-1}>
        Draw wall
      </button>
    </div>
  )
}

describe('useRovingRadioGroup', () => {
  it('keeps an arrow keystroke it handled away from the window listeners', () => {
    const onWindowKeyDown = vi.fn()
    window.addEventListener('keydown', onWindowKeyDown)

    try {
      render(<ToolRadios />)
      const checked = screen.getByRole('radio', { name: 'Select' })
      checked.focus()

      fireEvent.keyDown(checked, { key: 'ArrowRight' })

      expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Draw wall' }))
      expect(onWindowKeyDown).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('keydown', onWindowKeyDown)
    }
  })

  it('lets a keystroke it does not handle reach the window', () => {
    const onWindowKeyDown = vi.fn()
    window.addEventListener('keydown', onWindowKeyDown)

    try {
      render(<ToolRadios />)
      const checked = screen.getByRole('radio', { name: 'Select' })
      checked.focus()

      fireEvent.keyDown(checked, { key: 'Enter' })

      expect(onWindowKeyDown).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener('keydown', onWindowKeyDown)
    }
  })
})
