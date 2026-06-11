import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ViewModeProvider, useViewMode } from './view-mode'

afterEach(cleanup)

function Probe() {
  const { mode, setMode } = useViewMode()
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <button type="button" onClick={() => setMode('preview')}>
        Preview
      </button>
    </div>
  )
}

describe('view-mode', () => {
  it('defaults to plan mode', () => {
    render(
      <ViewModeProvider>
        <Probe />
      </ViewModeProvider>,
    )

    expect(screen.getByTestId('mode')).toHaveTextContent('plan')
  })

  it('updates the mode via setMode', async () => {
    const user = userEvent.setup()
    render(
      <ViewModeProvider>
        <Probe />
      </ViewModeProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Preview' }))

    expect(screen.getByTestId('mode')).toHaveTextContent('preview')
  })

  it('throws when used outside a provider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => render(<Probe />)).toThrow()

    consoleError.mockRestore()
  })
})
