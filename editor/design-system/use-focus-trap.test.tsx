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

function ShadedDialog({ tabIndex }: { tabIndex?: number | undefined }) {
  const ref = useFocusTrap<HTMLDivElement>()
  return (
    <div data-testid="shade">
      <div ref={ref} role="dialog" aria-label="Shaded" tabIndex={tabIndex}>
        <p>Question</p>
        <button type="button">First</button>
        <button type="button">Last</button>
      </div>
    </div>
  )
}

function ShadedHarness({ tabIndex }: { tabIndex?: number | undefined }) {
  return (
    <div>
      <button type="button">Opener</button>
      <ShadedDialog tabIndex={tabIndex} />
    </div>
  )
}

function renderShadedDialog(tabIndex?: number) {
  render(<ShadedHarness tabIndex={tabIndex} />)
}

describe('useFocusTrap and the pointer', () => {
  it('leaves focus where it is when the shade around the container is pressed', async () => {
    const user = userEvent.setup()
    renderShadedDialog()
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus()

    await user.click(screen.getByTestId('shade'))

    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus()
  })

  it('gives focus to the container when a part of it that cannot take focus is pressed', async () => {
    const user = userEvent.setup()
    renderShadedDialog()

    await user.click(screen.getByText('Question'))

    expect(screen.getByRole('dialog', { name: 'Shaded' })).toHaveFocus()
  })

  it('sends Tab from the container itself to the first focusable element and Shift+Tab to the last', async () => {
    const user = userEvent.setup()
    renderShadedDialog()

    await user.click(screen.getByText('Question'))
    await user.tab()
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus()

    await user.click(screen.getByText('Question'))
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus()
  })

  it('lets a container that already has its own tabindex take focus when it is pressed', async () => {
    const user = userEvent.setup()
    renderShadedDialog(-1)

    await user.click(screen.getByText('Question'))

    expect(screen.getByRole('dialog', { name: 'Shaded' })).toHaveFocus()
  })
})
