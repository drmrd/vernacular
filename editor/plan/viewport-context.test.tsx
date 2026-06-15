import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DEFAULT_PLAN_SCALE } from './viewport'
import { ViewportProvider, useViewport } from './viewport-context'

afterEach(cleanup)

function Probe() {
  const { viewport, setViewport } = useViewport()
  return (
    <div>
      <span data-testid="scale">{viewport.scale}</span>
      <button type="button" onClick={() => setViewport((current) => ({ ...current, scale: 1 }))}>
        Zoom
      </button>
    </div>
  )
}

describe('viewport-context', () => {
  it('defaults to the default plan scale', () => {
    render(
      <ViewportProvider>
        <Probe />
      </ViewportProvider>,
    )

    expect(screen.getByTestId('scale')).toHaveTextContent(String(DEFAULT_PLAN_SCALE))
  })

  it('updates the shared viewport via setViewport', async () => {
    const user = userEvent.setup()
    render(
      <ViewportProvider>
        <Probe />
      </ViewportProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Zoom' }))

    expect(screen.getByTestId('scale')).toHaveTextContent('1')
  })

  it('throws when used outside a provider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => render(<Probe />)).toThrow()

    consoleError.mockRestore()
  })
})
