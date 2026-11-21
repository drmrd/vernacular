import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SceneNavToolbar } from './scene-nav-toolbar'

// The control that closes every door and window from the 3D toolbar. It is the one control
// meant to work in both camera modes, so these tests pin it in orbit and in walk.

afterEach(cleanup)

const CLOSE_LABEL = 'Close doors and windows'
const NOTHING_TO_CLOSE_REASON =
  'Nothing to close. Open a door or window in walk mode with the E key.'

function baseProps() {
  return {
    mode: 'orbit' as const,
    onModeChange: vi.fn(),
    onReset: vi.fn(),
    colorTemperatureK: 6500,
    onColorTemperatureChange: vi.fn(),
  }
}

describe('SceneNavToolbar close doors and windows control', () => {
  it('places the control in its own group named Scene objects, styled like the other toolbar buttons', () => {
    render(<SceneNavToolbar {...baseProps()} />)

    const group = screen.getByRole('group', { name: 'Scene objects' })
    const button = screen.getByRole('button', { name: CLOSE_LABEL })
    expect(group).toHaveClass('scene-nav-toolbar__secondary')
    expect(group).toContainElement(button)
    expect(button).toHaveClass('scene-nav-toolbar__btn')
  })

  it('marks the control unavailable and says how to open a door when the interactive-object props are omitted', () => {
    render(<SceneNavToolbar {...baseProps()} />)

    const button = screen.getByRole('button', { name: CLOSE_LABEL })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button.getAttribute('title')).toMatch(/E key/)
  })

  it('keeps the unavailable control focusable and describes why there is nothing to close', () => {
    render(<SceneNavToolbar {...baseProps()} />)

    const button = screen.getByRole('button', { name: CLOSE_LABEL })
    button.focus()

    expect(button).toHaveFocus()
    expect(button).toHaveAccessibleDescription(NOTHING_TO_CLOSE_REASON)
  })

  it('enables the control in orbit mode when something is open, names the R key, and resets on click', async () => {
    const onResetInteractiveObjects = vi.fn()
    render(
      <SceneNavToolbar
        {...baseProps()}
        interactiveObjectsAtDefault={false}
        onResetInteractiveObjects={onResetInteractiveObjects}
      />,
    )

    const button = screen.getByRole('button', { name: CLOSE_LABEL })
    expect(button).toBeEnabled()
    expect(button).not.toHaveAttribute('aria-disabled')
    expect(button.getAttribute('title')).toMatch(/R key/)
    await userEvent.click(button)

    expect(onResetInteractiveObjects).toHaveBeenCalledTimes(1)
  })

  it('keeps the control enabled in walk mode when something is open, unlike the orbit-only controls', () => {
    render(<SceneNavToolbar {...baseProps()} mode="walk" interactiveObjectsAtDefault={false} />)

    const button = screen.getByRole('button', { name: CLOSE_LABEL })
    expect(button).toBeEnabled()
    expect(button).not.toHaveAttribute('aria-disabled')
  })

  it('does not call the handler when everything is already at its default', async () => {
    const onResetInteractiveObjects = vi.fn()
    render(
      <SceneNavToolbar
        {...baseProps()}
        interactiveObjectsAtDefault
        onResetInteractiveObjects={onResetInteractiveObjects}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: CLOSE_LABEL }))

    expect(onResetInteractiveObjects).not.toHaveBeenCalled()
  })
})
