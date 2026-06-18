import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '../design-system'
import { ThemeToggle } from './theme-toggle'

afterEach(cleanup)

function renderToggle() {
  return render(
    <ThemeProvider defaultChoice="light">
      <ThemeToggle />
    </ThemeProvider>,
  )
}

describe('ThemeToggle', () => {
  it('routes Light, Dark, and System through the segmented option vocabulary', () => {
    renderToggle()
    for (const name of [/^light$/i, /^dark$/i, /^system$/i]) {
      expect(screen.getByRole('button', { name })).toHaveClass('ds-segmented__option')
    }
  })

  it('exposes an accessible group named Theme', () => {
    renderToggle()
    expect(screen.getByRole('group', { name: /theme/i })).toBeInTheDocument()
  })

  it('marks the active choice option as pressed and active', () => {
    renderToggle()
    const light = screen.getByRole('button', { name: /^light$/i })
    const dark = screen.getByRole('button', { name: /^dark$/i })
    expect(light).toHaveClass('is-active')
    expect(light).toHaveAttribute('aria-pressed', 'true')
    expect(dark).not.toHaveClass('is-active')
    expect(dark).toHaveAttribute('aria-pressed', 'false')
  })

  it('switches the resolved theme when an option is chosen', async () => {
    const user = userEvent.setup()
    const { container } = renderToggle()
    expect(container.querySelector('[data-theme="light"]')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: /^dark$/i }))
    expect(container.querySelector('[data-theme="dark"]')).not.toBeNull()
  })
})
