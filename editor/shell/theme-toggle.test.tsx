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
  it('offers light, dark, and system options', () => {
    renderToggle()
    expect(screen.getByRole('radio', { name: /light/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /dark/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /system/i })).toBeInTheDocument()
  })

  it('switches the resolved theme when an option is chosen', async () => {
    const user = userEvent.setup()
    const { container } = renderToggle()
    expect(container.querySelector('[data-theme="light"]')).not.toBeNull()
    await user.click(screen.getByRole('radio', { name: /^dark$/i }))
    expect(container.querySelector('[data-theme="dark"]')).not.toBeNull()
  })
})
