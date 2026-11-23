import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SceneNavToolbar } from './scene-nav-toolbar'

afterEach(cleanup)

const baseProps = {
  mode: 'walk' as const,
  onModeChange: vi.fn(),
  onReset: vi.fn(),
  colorTemperatureK: 6500,
  onColorTemperatureChange: vi.fn(),
}

describe('SceneNavToolbar aim guide toggle', () => {
  it('renders an aim guide toggle in the display options group, on by default', () => {
    render(<SceneNavToolbar {...baseProps} />)

    const group = screen.getByRole('group', { name: /display options/i })
    const toggle = within(group).getByRole('button', { name: 'Aim guide' })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(toggle).toHaveClass('scene-nav-toolbar__btn')
  })

  it('marks the toggle not pressed when the aim guide is off', () => {
    render(<SceneNavToolbar {...baseProps} aimGuide={false} />)

    expect(screen.getByRole('button', { name: 'Aim guide' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('reports a toggle when clicked without flipping its own pressed state', async () => {
    const onToggleAimGuide = vi.fn()
    render(<SceneNavToolbar {...baseProps} onToggleAimGuide={onToggleAimGuide} />)

    const toggle = screen.getByRole('button', { name: 'Aim guide' })
    await userEvent.click(toggle)

    expect(onToggleAimGuide).toHaveBeenCalledTimes(1)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
  })

  it('lists surface edges before the aim guide', () => {
    render(<SceneNavToolbar {...baseProps} />)

    const group = screen.getByRole('group', { name: /display options/i })
    const names = within(group)
      .getAllByRole('button')
      .map((button) => button.textContent)
    expect(names).toEqual(['Surface edges', 'Aim guide'])
  })
})
