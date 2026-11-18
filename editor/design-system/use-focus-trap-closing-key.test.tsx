import { useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { flushSync } from 'react-dom'
import { describe, it, expect, afterEach, beforeEach, vi, type Mock } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useFocusTrap } from './use-focus-trap'

type KeyHandler = (event: ReactKeyboardEvent) => void
type KeySpy = Mock<(event: KeyboardEvent) => void>

// A real browser commits the unmount at once when a handler asks for it during the event. The
// testing library batches the update instead, so these dialogs close with flushSync, and they
// stop the propagation only when a case says so.
function closingOnEscape(close: () => void, stopPropagation: boolean): KeyHandler {
  return (event) => {
    if (event.key !== 'Escape') {
      return
    }
    if (stopPropagation) {
      event.stopPropagation()
    }
    flushSync(close)
  }
}

interface ClosingDialogProps {
  label: string
  onKeyDown?: KeyHandler | undefined
  onKeyUp?: KeyHandler | undefined
}

function ClosingDialog({ label, onKeyDown, onKeyUp }: ClosingDialogProps) {
  const ref = useFocusTrap<HTMLDivElement>()
  return (
    <div ref={ref} role="dialog" aria-label={label} onKeyDown={onKeyDown} onKeyUp={onKeyUp}>
      <input aria-label={`${label} field`} />
    </div>
  )
}

function SingleClosingHost({
  closeOn = 'keydown',
  stopPropagation = false,
}: {
  closeOn?: 'keydown' | 'keyup'
  stopPropagation?: boolean
}) {
  const [open, setOpen] = useState(true)
  const handler = closingOnEscape(() => setOpen(false), stopPropagation)
  return (
    <div>
      <button type="button">Opener</button>
      {open ? (
        <ClosingDialog
          label="Single"
          onKeyDown={closeOn === 'keydown' ? handler : undefined}
          onKeyUp={closeOn === 'keyup' ? handler : undefined}
        />
      ) : null}
    </div>
  )
}

// The later dialog stands beside the earlier one and mounts after it, so it is the active trap.
function TwoClosingHost() {
  const [earlierOpen, setEarlierOpen] = useState(true)
  const [laterOpen, setLaterOpen] = useState(true)
  return (
    <div>
      {earlierOpen ? (
        <ClosingDialog
          label="Earlier"
          onKeyDown={closingOnEscape(() => setEarlierOpen(false), false)}
        />
      ) : null}
      {laterOpen ? (
        <ClosingDialog
          label="Later"
          onKeyDown={closingOnEscape(() => setLaterOpen(false), false)}
        />
      ) : null}
    </div>
  )
}

describe('useFocusTrap and the key that closes it', () => {
  let onWindow: KeySpy
  let onDocument: KeySpy
  let onWindowKeyUp: KeySpy

  beforeEach(() => {
    onWindow = vi.fn()
    onDocument = vi.fn()
    onWindowKeyUp = vi.fn()
    window.addEventListener('keydown', onWindow)
    document.addEventListener('keydown', onDocument)
    window.addEventListener('keyup', onWindowKeyUp)
  })

  afterEach(() => {
    window.removeEventListener('keydown', onWindow)
    document.removeEventListener('keydown', onDocument)
    window.removeEventListener('keyup', onWindowKeyUp)
    cleanup()
  })

  it('holds back from document and window the Escape that closes the dialog during its keydown', async () => {
    const user = userEvent.setup()
    render(<SingleClosingHost />)
    expect(screen.getByRole('textbox', { name: 'Single field' })).toHaveFocus()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onWindow).not.toHaveBeenCalled()
    expect(onDocument).not.toHaveBeenCalled()
  })

  it('lets a later key reach window once the dialog is gone', async () => {
    const user = userEvent.setup()
    render(<SingleClosingHost />)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    onWindow.mockClear()

    await user.keyboard('a')

    expect(onWindow).toHaveBeenCalledTimes(1)
    expect(onWindow.mock.calls[0]?.[0].key).toBe('a')
  })

  it('hands the hold to the earlier dialog when the later one closes on the key that it holds back', async () => {
    const user = userEvent.setup()
    render(<TwoClosingHost />)
    expect(screen.getByRole('textbox', { name: 'Later field' })).toHaveFocus()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog', { name: 'Later' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Earlier' })).toBeInTheDocument()
    expect(onWindow).not.toHaveBeenCalled()

    await user.keyboard('x')

    expect(onWindow).not.toHaveBeenCalled()
  })

  it('keeps from window the Escape of a dialog that closes itself and stops the propagation', async () => {
    const user = userEvent.setup()
    render(<SingleClosingHost stopPropagation />)

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onWindow).not.toHaveBeenCalled()

    await user.keyboard('a')

    expect(onWindow).toHaveBeenCalledTimes(1)
    expect(onWindow.mock.calls[0]?.[0].key).toBe('a')
  })

  it('never holds back a keyup, not even the one that closes the dialog', async () => {
    const user = userEvent.setup()
    render(<SingleClosingHost closeOn="keyup" />)

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onWindowKeyUp).toHaveBeenCalledTimes(1)
  })
})
