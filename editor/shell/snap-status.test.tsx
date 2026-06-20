import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SnapPreferencesProvider } from '../plan/snap-preferences-provider'
import { createSnapPreferencesStore } from '../plan/snap-preferences-store'
import { SnapStatus } from './snap-status'

afterEach(cleanup)

function renderSnapStatus() {
  const store = createSnapPreferencesStore()
  render(
    <SnapPreferencesProvider store={store}>
      <SnapStatus />
    </SnapPreferencesProvider>,
  )
}

describe('SnapStatus', () => {
  it('hides the precision popover until the indicator is clicked', () => {
    renderSnapStatus()
    expect(screen.queryByRole('checkbox', { name: /grid/i })).toBeNull()
  })

  it('opens a precision popover with per-kind toggles when the indicator is clicked', async () => {
    const user = userEvent.setup()
    renderSnapStatus()
    await user.click(screen.getByRole('button', { name: /snap/i }))
    expect(screen.getByRole('checkbox', { name: /grid/i })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /endpoint/i })).toBeInTheDocument()
  })

  it('renders a disclosure caret cue on the indicator that reflects the open state', async () => {
    const user = userEvent.setup()
    renderSnapStatus()
    const button = screen.getByRole('button', { name: /snap/i })
    const caret = button.querySelector('.snap-status__caret')
    expect(caret).not.toBeNull()
    expect(caret).toHaveAttribute('aria-hidden', 'true')
    expect(caret).not.toHaveClass('is-open')
    await user.click(button)
    expect(caret).toHaveClass('is-open')
  })
})
