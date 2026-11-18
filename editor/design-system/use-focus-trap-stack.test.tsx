import { StrictMode } from 'react'
import { describe, it, expect, afterEach, vi, type Mock } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useFocusTrap } from './use-focus-trap'

afterEach(cleanup)

function pressOn(element: Element): MouseEvent {
  const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
  element.dispatchEvent(press)
  return press
}

interface KeydownSpies {
  onWindow: Mock<(event: KeyboardEvent) => void>
  onDocument: Mock<(event: KeyboardEvent) => void>
}

// Listens for keydown on both places an editor-wide handler would sit, and always lets go.
async function whileListening(body: (spies: KeydownSpies) => Promise<void>) {
  const spies: KeydownSpies = { onWindow: vi.fn(), onDocument: vi.fn() }
  window.addEventListener('keydown', spies.onWindow)
  document.addEventListener('keydown', spies.onDocument)
  try {
    await body(spies)
  } finally {
    window.removeEventListener('keydown', spies.onWindow)
    document.removeEventListener('keydown', spies.onDocument)
  }
}

function OuterTrap() {
  const ref = useFocusTrap<HTMLDivElement>()
  return (
    <div ref={ref} role="dialog" aria-label="Outer">
      <input aria-label="Outer first" />
      <input aria-label="Outer second" />
    </div>
  )
}

function InnerTrap() {
  const ref = useFocusTrap<HTMLDivElement>()
  return (
    <div ref={ref} role="dialog" aria-label="Inner">
      <button type="button">Inner first</button>
      <button type="button">Inner second</button>
    </div>
  )
}

function Traps({ outer, inner }: { outer: boolean; inner: boolean }) {
  return (
    <div>
      <button type="button">Elsewhere</button>
      {outer ? <OuterTrap /> : null}
      {inner ? <InnerTrap /> : null}
    </div>
  )
}

function SingleTrap() {
  const ref = useFocusTrap<HTMLDivElement>()
  return (
    <div>
      <button type="button">Opener</button>
      <div ref={ref} role="dialog" aria-label="Single">
        <input aria-label="First field" />
        <input aria-label="Second field" />
      </div>
    </div>
  )
}

// The outer trap mounts first and the inner one after it, so the inner one is the newest.
function mountOuterThenInnerTrap() {
  const view = render(<Traps outer={true} inner={false} />)
  view.rerender(<Traps outer={true} inner={true} />)
  return {
    ...view,
    innerFirst: screen.getByRole('button', { name: 'Inner first' }),
    innerSecond: screen.getByRole('button', { name: 'Inner second' }),
    elsewhere: screen.getByRole('button', { name: 'Elsewhere' }),
  }
}

describe('useFocusTrap with two traps mounted', () => {
  it('lets only the newest of two traps act while both are mounted', async () => {
    const user = userEvent.setup()
    const { innerFirst, innerSecond, elsewhere } = mountOuterThenInnerTrap()
    expect(innerFirst).toHaveFocus()

    await whileListening(async ({ onWindow, onDocument }) => {
      await user.keyboard('x')
      expect(onWindow).not.toHaveBeenCalled()
      expect(onDocument).not.toHaveBeenCalled()
      expect(innerFirst).toHaveFocus()

      expect(pressOn(innerSecond).defaultPrevented).toBe(false)
      expect(pressOn(elsewhere).defaultPrevented).toBe(true)
      await user.click(innerSecond)
      expect(innerSecond).toHaveFocus()
    })
  })

  it('hands over to the older trap when the newest one unmounts', async () => {
    const user = userEvent.setup()
    const { rerender } = mountOuterThenInnerTrap()

    await whileListening(async ({ onWindow, onDocument }) => {
      rerender(<Traps outer={true} inner={false} />)
      expect(screen.getByRole('textbox', { name: 'Outer first' })).toHaveFocus()
      await user.keyboard('x')
      expect(onWindow).not.toHaveBeenCalled()
      expect(onDocument).not.toHaveBeenCalled()

      expect(pressOn(screen.getByRole('button', { name: 'Elsewhere' })).defaultPrevented).toBe(true)
      await user.tab({ shift: true })
      expect(screen.getByRole('textbox', { name: 'Outer second' })).toHaveFocus()
    })
  })

  it('keeps the newer trap acting when the older one unmounts first, until it unmounts too', async () => {
    const user = userEvent.setup()
    const { rerender, innerFirst, elsewhere } = mountOuterThenInnerTrap()
    rerender(<Traps outer={false} inner={true} />)
    innerFirst.focus()

    await whileListening(async ({ onWindow }) => {
      await user.keyboard('x')
      expect(onWindow).not.toHaveBeenCalled()
      expect(pressOn(elsewhere).defaultPrevented).toBe(true)

      rerender(<Traps outer={false} inner={false} />)
      await user.keyboard('x')
      expect(onWindow).toHaveBeenCalled()
    })
  })
})

describe('useFocusTrap and a key pressed with focus outside the trap', () => {
  function keydownOnOpener(key: string) {
    render(<SingleTrap />)
    const opener = screen.getByRole('button', { name: 'Opener' })
    opener.focus()
    const notPrevented = fireEvent.keyDown(opener, { key, cancelable: true })
    return { defaultPrevented: !notPrevented }
  }

  it('cancels a Tab and moves focus to the first focusable element in the trap', () => {
    const { defaultPrevented } = keydownOnOpener('Tab')

    expect(defaultPrevented).toBe(true)
    expect(screen.getByRole('textbox', { name: 'First field' })).toHaveFocus()
  })

  it('leaves the default of any other key alone and still moves focus into the trap', () => {
    const { defaultPrevented } = keydownOnOpener('a')

    expect(defaultPrevented).toBe(false)
    expect(screen.getByRole('textbox', { name: 'First field' })).toHaveFocus()
  })
})

describe('useFocusTrap under the development double mount', () => {
  it('acts as exactly one trap while mounted and lets go of everything on unmount', async () => {
    const user = userEvent.setup()
    const { unmount } = render(
      <StrictMode>
        <SingleTrap />
      </StrictMode>,
    )

    await whileListening(async ({ onWindow }) => {
      expect(pressOn(screen.getByRole('button', { name: 'Opener' })).defaultPrevented).toBe(true)
      await user.keyboard('x')
      expect(onWindow).not.toHaveBeenCalled()

      unmount()
      await user.keyboard('x')
      expect(onWindow).toHaveBeenCalled()
      expect(pressOn(document.body).defaultPrevented).toBe(false)
    })
  })
})
