import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider, useTheme } from './theme-provider'

function mockMatchMedia(prefersDark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: prefersDark && query.includes('dark'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  mockMatchMedia(false)
})

function ThemeReadout() {
  const { choice, setChoice } = useTheme()
  return (
    <>
      <p>choice: {choice}</p>
      <button onClick={() => setChoice('dark')}>Go dark</button>
    </>
  )
}

describe('ThemeProvider', () => {
  it('renders children inside a themed container', () => {
    render(
      <ThemeProvider>
        <p>hello</p>
      </ThemeProvider>,
    )
    expect(screen.getByText('hello')).toBeInTheDocument()
  })

  it('defaults to the system choice and applies the OS-resolved theme', () => {
    mockMatchMedia(false)
    const { container } = render(
      <ThemeProvider>
        <ThemeReadout />
      </ThemeProvider>,
    )
    expect(screen.getByText('choice: system')).toBeInTheDocument()
    expect(container.querySelector('[data-theme]')?.getAttribute('data-theme')).toBe('light')
  })

  it('resolves dark when the OS prefers dark and the choice is system', () => {
    mockMatchMedia(true)
    const { container } = render(
      <ThemeProvider>
        <ThemeReadout />
      </ThemeProvider>,
    )
    expect(container.querySelector('[data-theme]')?.getAttribute('data-theme')).toBe('dark')
  })

  it('applies the chosen theme when setChoice is called', async () => {
    const { container } = render(
      <ThemeProvider>
        <ThemeReadout />
      </ThemeProvider>,
    )
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Go dark' }))
    })
    expect(screen.getByText('choice: dark')).toBeInTheDocument()
    expect(container.querySelector('[data-theme]')?.getAttribute('data-theme')).toBe('dark')
  })
})
