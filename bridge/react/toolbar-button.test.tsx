import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToolbarButton } from './toolbar-button'

afterEach(cleanup)

const LABEL = 'Top down'
const REASON = 'Walk mode would overwrite the pose on the next frame.'
const HINT = 'Frames the model from above.'

function renderButton(props: Partial<Parameters<typeof ToolbarButton>[0]> = {}) {
  const onActivate = vi.fn()
  render(<ToolbarButton label={LABEL} onActivate={onActivate} {...props} />)
  return { onActivate, button: screen.getByRole('button', { name: LABEL }) }
}

describe('ToolbarButton unavailable state', () => {
  it('stays focusable and gives its reason as description and title', () => {
    const { button } = renderButton({ unavailableReason: REASON })

    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).not.toHaveAttribute('disabled')
    button.focus()
    expect(button).toHaveFocus()
    expect(button).toHaveAccessibleDescription(REASON)
    expect(button).toHaveAttribute('title', REASON)
  })

  it('carries no disabled markup and no description when available', () => {
    const { button } = renderButton()

    expect(button).not.toHaveAttribute('aria-disabled')
    expect(button).toHaveAccessibleDescription('')
    expect(button).not.toHaveAttribute('title')
  })

  it('uses the title prop as the hover hint while available', () => {
    const { button } = renderButton({ title: HINT })

    expect(button).toHaveAttribute('title', HINT)
  })
})

describe('ToolbarButton presentation', () => {
  it('sets aria-pressed only when pressed is given', () => {
    const { button } = renderButton({ pressed: false })

    expect(button).toHaveAttribute('aria-pressed', 'false')
  })

  it('omits aria-pressed when pressed is not given', () => {
    const { button } = renderButton()

    expect(button).not.toHaveAttribute('aria-pressed')
  })

  it('uses the toolbar button class by default', () => {
    const { button } = renderButton()

    expect(button).toHaveClass('scene-nav-toolbar__btn')
  })
})

describe('ToolbarButton activation', () => {
  it('swallows click, Enter and Space while unavailable', async () => {
    const user = userEvent.setup()
    const { button, onActivate } = renderButton({ unavailableReason: REASON })

    await user.click(button)
    button.focus()
    await user.keyboard('{Enter}')
    await user.keyboard(' ')

    expect(onActivate).not.toHaveBeenCalled()
  })

  it('activates exactly once per click while available', async () => {
    const user = userEvent.setup()
    const { button, onActivate } = renderButton()

    await user.click(button)

    expect(onActivate).toHaveBeenCalledTimes(1)
  })
})
