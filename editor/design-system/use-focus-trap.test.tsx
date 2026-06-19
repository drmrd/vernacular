import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useFocusTrap } from './use-focus-trap'

afterEach(cleanup)

function TrappedDialog() {
  const ref = useFocusTrap<HTMLDivElement>()
  return (
    <div ref={ref} role="dialog" aria-label="Trapped">
      <input aria-label="First field" />
      <input aria-label="Second field" />
    </div>
  )
}

function Harness({ open }: { open: boolean }) {
  return (
    <div>
      <button>Opener</button>
      {open ? <TrappedDialog /> : null}
    </div>
  )
}

describe('useFocusTrap', () => {
  it('focuses the first focusable element on mount and restores the opener on unmount', () => {
    const { rerender } = render(<Harness open={false} />)

    const opener = screen.getByRole('button', { name: 'Opener' })
    opener.focus()
    expect(document.activeElement).toBe(opener)

    rerender(<Harness open={true} />)
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'First field' }))

    rerender(<Harness open={false} />)
    expect(document.activeElement).toBe(opener)
  })

  it('cycles Tab focus within the container, wrapping last to first and first to last', async () => {
    const user = userEvent.setup()
    render(<Harness open={true} />)

    const dialog = screen.getByRole('dialog', { name: 'Trapped' })
    const firstField = screen.getByRole('textbox', { name: 'First field' })
    const lastField = screen.getByRole('textbox', { name: 'Second field' })

    lastField.focus()
    expect(document.activeElement).toBe(lastField)

    await user.tab()
    expect(document.activeElement).toBe(firstField)
    expect(dialog.contains(document.activeElement)).toBe(true)

    await user.tab({ shift: true })
    expect(document.activeElement).toBe(lastField)
    expect(dialog.contains(document.activeElement)).toBe(true)
  })
})
