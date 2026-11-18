import { describe, it, expect, afterEach, vi, type Mock } from 'vitest'
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

function pressOn(element: Element): MouseEvent {
  const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
  element.dispatchEvent(press)
  return press
}

describe('useFocusTrap cleanup', () => {
  // The container is held by reference and read after it has left the document, so the
  // attribute that is checked is the one the hook itself put there and took away again.
  it('takes back the tabindex it gave the container when the trap unmounts', () => {
    const { rerender } = render(<Harness open={true} />)
    const dialog = screen.getByRole('dialog', { name: 'Trapped' })
    expect(dialog).toHaveAttribute('tabindex', '-1')

    rerender(<Harness open={false} />)

    expect(dialog.isConnected).toBe(false)
    expect(dialog).not.toHaveAttribute('tabindex')
  })

  it('keeps the tabindex the caller gave the container, while mounted and after it unmounts', () => {
    const { unmount } = render(<ShadedHarness tabIndex={0} />)
    const dialog = screen.getByRole('dialog', { name: 'Shaded' })
    expect(dialog).toHaveAttribute('tabindex', '0')

    unmount()

    expect(dialog).toHaveAttribute('tabindex', '0')
  })

  it('stops cancelling the default of a press outside the container once the trap unmounts', () => {
    const { rerender } = render(<Harness open={true} />)
    const opener = screen.getByRole('button', { name: 'Opener' })
    expect(pressOn(opener).defaultPrevented).toBe(true)

    rerender(<Harness open={false} />)

    expect(pressOn(opener).defaultPrevented).toBe(false)
  })
})

type KeyEventType = 'keydown' | 'keyup'

interface KeySpies {
  onWindow: Mock<(event: KeyboardEvent) => void>
  onDocument: Mock<(event: KeyboardEvent) => void>
}

// Listens for the key on both places an editor-wide handler would sit, and always lets go.
async function whileListening(type: KeyEventType, body: (spies: KeySpies) => Promise<void>) {
  const spies: KeySpies = { onWindow: vi.fn(), onDocument: vi.fn() }
  window.addEventListener(type, spies.onWindow)
  document.addEventListener(type, spies.onDocument)
  try {
    await body(spies)
  } finally {
    window.removeEventListener(type, spies.onWindow)
    document.removeEventListener(type, spies.onDocument)
  }
}

function ListeningDialog({ onKeyDown }: { onKeyDown: (event: React.KeyboardEvent) => void }) {
  const ref = useFocusTrap<HTMLDivElement>()
  return (
    <div ref={ref} role="dialog" aria-label="Listening" onKeyDown={onKeyDown}>
      <input aria-label="First field" />
    </div>
  )
}

describe('useFocusTrap and the keys behind it', () => {
  it('hides every keydown from the listeners on the document and the window', async () => {
    const user = userEvent.setup()
    render(<Harness open={true} />)

    await whileListening('keydown', async ({ onWindow, onDocument }) => {
      await user.keyboard('{Control>}k{/Control}')
      await user.keyboard('{Delete}')
      await user.keyboard('w')

      expect(onWindow).not.toHaveBeenCalled()
      expect(onDocument).not.toHaveBeenCalled()
    })
  })

  it('still hands every key to the handlers on the container itself', async () => {
    const user = userEvent.setup()
    const keys: string[] = []
    render(<ListeningDialog onKeyDown={(event) => keys.push(event.key)} />)

    await user.keyboard('{Escape}')

    expect(keys).toEqual(['Escape'])
  })

  it('lets the field inside the container take typed text', async () => {
    const user = userEvent.setup()
    render(<Harness open={true} />)
    const firstField = screen.getByRole('textbox', { name: 'First field' })

    await user.type(firstField, 'abc')

    expect(firstField).toHaveValue('abc')
  })

  it('lets keyup through so that a held key is released', async () => {
    const user = userEvent.setup()
    render(<Harness open={true} />)

    await whileListening('keyup', async ({ onWindow }) => {
      await user.keyboard('a')

      expect(onWindow).toHaveBeenCalled()
    })
  })

  it('holds back a key pressed with focus outside and moves focus into the container', async () => {
    const user = userEvent.setup()
    render(<Harness open={true} />)
    ;(document.activeElement as HTMLElement).blur()

    await whileListening('keydown', async ({ onWindow }) => {
      await user.keyboard('{Delete}')

      expect(onWindow).not.toHaveBeenCalled()
    })
    expect(screen.getByRole('textbox', { name: 'First field' })).toHaveFocus()
  })

  it('lets keys reach the window again once the trap unmounts', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<Harness open={true} />)
    rerender(<Harness open={false} />)

    await whileListening('keydown', async ({ onWindow }) => {
      await user.keyboard('x')

      expect(onWindow).toHaveBeenCalled()
    })
  })
})
