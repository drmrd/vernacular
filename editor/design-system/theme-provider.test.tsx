import type { ReactNode } from 'react'
import { describe, it, expect, afterEach, beforeEach, vi, type MockInstance } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsProvider } from '../../bridge'
import { createSettingsService, type SettingKey, type SettingsService } from '../../session'
import { InMemorySettingsPort } from '../../session/testing'
import { isThemeChoice, type ThemeChoice } from './theme'
import { ThemeProvider, useTheme } from './theme-provider'

/** The name that the theme choice is kept under in the settings. */
const THEME_NAME = 'theme'

/** A key of the theme setting that a case holds for itself, so a case can set the theme from outside. */
const THEME_KEY: SettingKey<ThemeChoice> = {
  name: THEME_NAME,
  defaultValue: 'system',
  parse: (raw) => (isThemeChoice(raw) ? raw : undefined),
}

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

let browserReads: MockInstance<Storage['getItem']>
let browserWrites: MockInstance<Storage['setItem']>
let browserRemovals: MockInstance<Storage['removeItem']>

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// The browser storage of the test run answers that it holds nothing and keeps nothing, so that no
// case passes through what an earlier case left there.
beforeEach(() => {
  mockMatchMedia(false)
  browserReads = vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null)
  browserWrites = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => undefined)
  browserRemovals = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => undefined)
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

  // The design language is the second theming axis (ADR-0154). It rides the same
  // wrapper as data-theme so one attribute swap retargets the whole custom-property
  // layer, and it stays on the shipped language unless the preview flag says otherwise.
  it('stamps the shipped design language by default', () => {
    const { container } = render(
      <ThemeProvider>
        <p>hello</p>
      </ThemeProvider>,
    )
    expect(
      container.querySelector('[data-design-language]')?.getAttribute('data-design-language'),
    ).toBe('draughtsmans-restraint')
  })

  it('stamps Arris when the preview language is selected', () => {
    const { container } = render(
      <ThemeProvider designLanguage="arris">
        <p>hello</p>
      </ThemeProvider>,
    )
    expect(
      container.querySelector('[data-design-language]')?.getAttribute('data-design-language'),
    ).toBe('arris')
  })

  it('carries both theming axes on the same wrapper element', () => {
    mockMatchMedia(true)
    const { container } = render(
      <ThemeProvider designLanguage="arris">
        <p>hello</p>
      </ThemeProvider>,
    )
    const wrapper = container.querySelector('[data-theme]')
    expect(wrapper?.getAttribute('data-theme')).toBe('dark')
    expect(wrapper?.getAttribute('data-design-language')).toBe('arris')
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

/** Records the resolved theme of each render of the provider's tree. */
function ThemeProbe({ seen }: { seen: string[] }) {
  seen.push(useTheme().resolved)
  return null
}

/** A settings service over a port that already holds `stored` under the theme name, if any. */
function serviceStoring(port: InMemorySettingsPort, stored?: unknown): SettingsService {
  if (stored !== undefined) {
    port.write(THEME_NAME, stored)
  }
  return createSettingsService(port)
}

function withSettings(service: SettingsService, children: ReactNode) {
  return <SettingsProvider service={service}>{children}</SettingsProvider>
}

function shownTheme(container: HTMLElement): string | null | undefined {
  return container.querySelector('[data-theme]')?.getAttribute('data-theme')
}

describe('ThemeProvider over a settings service', () => {
  it('with dark stored, no render shows another theme', () => {
    const seen: string[] = []
    const service = serviceStoring(new InMemorySettingsPort(), 'dark')

    const { container } = render(
      withSettings(
        service,
        <ThemeProvider>
          <ThemeProbe seen={seen} />
        </ThemeProvider>,
      ),
    )

    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every((theme) => theme === 'dark')).toBe(true)
    expect(shownTheme(container)).toBe('dark')
  })

  it('a choice reaches the settings port', async () => {
    const port = new InMemorySettingsPort()

    render(
      withSettings(
        serviceStoring(port),
        <ThemeProvider>
          <ThemeReadout />
        </ThemeProvider>,
      ),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Go dark' }))

    expect(screen.getByText('choice: dark')).toBeInTheDocument()
    expect(port.read(THEME_NAME)).toBe('dark')
  })

  it('a stored value that is not a theme choice gives the default choice', () => {
    const port = new InMemorySettingsPort()

    const { container } = render(
      withSettings(
        serviceStoring(port, 'blue'),
        <ThemeProvider defaultChoice="light">
          <ThemeReadout />
        </ThemeProvider>,
      ),
    )

    expect(screen.getByText('choice: light')).toBeInTheDocument()
    expect(shownTheme(container)).toBe('light')
    expect(port.read(THEME_NAME)).toBe('blue')
  })

  it('a stored choice wins over defaultChoice', () => {
    const { container } = render(
      withSettings(
        serviceStoring(new InMemorySettingsPort(), 'dark'),
        <ThemeProvider defaultChoice="light">
          <ThemeReadout />
        </ThemeProvider>,
      ),
    )

    expect(screen.getByText('choice: dark')).toBeInTheDocument()
    expect(shownTheme(container)).toBe('dark')
  })

  it('defaultChoice applies while nothing is stored, and reading stores nothing', () => {
    const port = new InMemorySettingsPort()
    const write = vi.spyOn(port, 'write')

    const { container } = render(
      withSettings(
        serviceStoring(port),
        <ThemeProvider defaultChoice="dark">
          <ThemeReadout />
        </ThemeProvider>,
      ),
    )

    expect(screen.getByText('choice: dark')).toBeInTheDocument()
    expect(shownTheme(container)).toBe('dark')
    expect(write).not.toHaveBeenCalled()
    expect(port.read(THEME_NAME)).toBeUndefined()
  })

  it('a theme set through the service from outside changes the theme', () => {
    const service = serviceStoring(new InMemorySettingsPort())
    const { container } = render(
      withSettings(
        service,
        <ThemeProvider>
          <ThemeReadout />
        </ThemeProvider>,
      ),
    )
    expect(screen.getByText('choice: system')).toBeInTheDocument()

    act(() => service.set(THEME_KEY, 'dark'))

    expect(screen.getByText('choice: dark')).toBeInTheDocument()
    expect(shownTheme(container)).toBe('dark')
  })
})

describe('ThemeProvider with no settings above it', () => {
  it('with no settings above it a choice lasts for the mount only and calls no browser storage', async () => {
    const first = render(
      <ThemeProvider>
        <ThemeReadout />
      </ThemeProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Go dark' }))
    expect(screen.getByText('choice: dark')).toBeInTheDocument()
    first.unmount()

    render(
      <ThemeProvider>
        <ThemeReadout />
      </ThemeProvider>,
    )

    expect(screen.getByText('choice: system')).toBeInTheDocument()
    expect(browserReads).not.toHaveBeenCalled()
    expect(browserWrites).not.toHaveBeenCalled()
    expect(browserRemovals).not.toHaveBeenCalled()
  })
})
