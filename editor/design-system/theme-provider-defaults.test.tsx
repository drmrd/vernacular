import { StrictMode, useLayoutEffect, useRef, type ReactNode } from 'react'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { SettingsProvider } from '../../bridge'
import { createSettingsService, type SettingsService } from '../../session'
import { InMemorySettingsPort } from '../../session/testing'
import type { ThemeChoice } from './theme'
import { ThemeProvider, useTheme } from './theme-provider'

/** The name that the theme choice is kept under in the settings. */
const THEME_NAME = 'theme'

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

// The browser storage of the test run answers that it holds nothing and keeps nothing, so that no
// case passes through what an earlier case left there.
beforeEach(() => {
  mockMatchMedia(false)
  vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => undefined)
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Shows the choice of the nearest theme provider under a label that tells the providers apart. */
function Choice({ label }: { label: string }) {
  return (
    <p>
      {label} choice: {useTheme().choice}
    </p>
  )
}

/** A provider with `defaultChoice` that shows its own choice under `label`. */
function LabelledTheme({ label, defaultChoice }: { label: string; defaultChoice: ThemeChoice }) {
  return (
    <ThemeProvider defaultChoice={defaultChoice}>
      <Choice label={label} />
    </ThemeProvider>
  )
}

function withService(service: SettingsService, children: ReactNode) {
  return <SettingsProvider service={service}>{children}</SettingsProvider>
}

function withSettings(port: InMemorySettingsPort, children: ReactNode) {
  return withService(createSettingsService(port), children)
}

function shownThemes(container: HTMLElement): (string | null)[] {
  return [...container.querySelectorAll('[data-theme]')].map((wrapper) =>
    wrapper.getAttribute('data-theme'),
  )
}

describe('two theme providers under one settings service', () => {
  it.each<{ first: ThemeChoice; second: ThemeChoice }>([
    { first: 'light', second: 'dark' },
    { first: 'dark', second: 'light' },
  ])(
    'both show the default of the one that rendered first ($first, then $second)',
    ({ first, second }) => {
      const port = new InMemorySettingsPort()
      const write = vi.spyOn(port, 'write')

      const { container } = render(
        withSettings(
          port,
          <>
            <LabelledTheme label="first" defaultChoice={first} />
            <LabelledTheme label="second" defaultChoice={second} />
          </>,
        ),
      )

      expect(screen.getByText(`first choice: ${first}`)).toBeInTheDocument()
      expect(screen.getByText(`second choice: ${first}`)).toBeInTheDocument()
      expect(shownThemes(container)).toEqual([first, first])
      expect(write).not.toHaveBeenCalled()
      expect(port.read(THEME_NAME)).toBeUndefined()
    },
  )
})

describe('a defaultChoice that changes on a mounted provider', () => {
  it('is ignored under a settings service', () => {
    const service = createSettingsService(new InMemorySettingsPort())
    const { container, rerender } = render(
      withService(service, <LabelledTheme label="only" defaultChoice="light" />),
    )

    rerender(withService(service, <LabelledTheme label="only" defaultChoice="dark" />))

    expect(screen.getByText('only choice: light')).toBeInTheDocument()
    expect(shownThemes(container)).toEqual(['light'])
  })

  it('is ignored with no settings above the provider', () => {
    const { container, rerender } = render(<LabelledTheme label="only" defaultChoice="light" />)

    rerender(<LabelledTheme label="only" defaultChoice="dark" />)

    expect(screen.getByText('only choice: light')).toBeInTheDocument()
    expect(shownThemes(container)).toEqual(['light'])
  })
})

describe('a stored system choice', () => {
  it('wins over defaultChoice, and the theme follows the system preference', () => {
    mockMatchMedia(false)
    const port = new InMemorySettingsPort()
    port.write(THEME_NAME, 'system')

    const { container } = render(
      withSettings(port, <LabelledTheme label="only" defaultChoice="dark" />),
    )

    expect(screen.getByText('only choice: system')).toBeInTheDocument()
    expect(shownThemes(container)).toEqual(['light'])
  })
})

/** What one committed render of the probe showed: the resolved theme, and the theme on the wrapper. */
interface Commit {
  resolved: string
  wrapper: string | null | undefined
}

/** Records, at each commit, the resolved theme and the theme of the wrapper that holds the probe. */
function CommitProbe({ commits }: { commits: Commit[] }) {
  const { resolved } = useTheme()
  const marker = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const wrapper = marker.current?.closest('[data-theme]')?.getAttribute('data-theme')
    commits.push({ resolved, wrapper })
  })
  return <span ref={marker} />
}

describe('a theme provider under strict mode', () => {
  it('shows the stored dark theme at every commit and writes nothing', () => {
    const port = new InMemorySettingsPort()
    port.write(THEME_NAME, 'dark')
    const write = vi.spyOn(port, 'write')
    const commits: Commit[] = []

    render(
      <StrictMode>
        {withSettings(
          port,
          <ThemeProvider>
            <CommitProbe commits={commits} />
          </ThemeProvider>,
        )}
      </StrictMode>,
    )

    expect(commits.length).toBeGreaterThan(0)
    expect(commits.every((commit) => commit.resolved === 'dark' && commit.wrapper === 'dark')).toBe(
      true,
    )
    expect(write).not.toHaveBeenCalled()
  })
})
