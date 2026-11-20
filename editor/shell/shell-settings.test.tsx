import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { SettingsProvider } from '../../bridge'
import { createSettingsService, type SettingsService } from '../../session'
import { InMemorySettingsPort } from '../../session/testing'
import {
  stubEmptyBrowserStorage,
  type EmptyBrowserStorage,
} from '../design-system/browser-environment-test-support'
import { DEFAULT_SNAP_PREFERENCES } from '../plan/snap-preferences'
import { SETTING_NAME, shellWithProbe } from './shell-settings-test-support'

let browser: EmptyBrowserStorage

beforeEach(() => {
  browser = stubEmptyBrowserStorage()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** Renders the shell providers with the probe inside, below the settings of `service` if one is given. */
function renderShell(service?: SettingsService) {
  const shell = shellWithProbe()
  render(
    service === undefined ? shell : <SettingsProvider service={service}>{shell}</SettingsProvider>,
  )
}

describe('the snap preferences of the shell', () => {
  it('the shell starts with the snap preferences of the settings above it', () => {
    const port = new InMemorySettingsPort()
    port.write(SETTING_NAME, {
      ...DEFAULT_SNAP_PREFERENCES,
      kinds: { ...DEFAULT_SNAP_PREFERENCES.kinds, grid: false },
    })

    renderShell(createSettingsService(port))

    expect(screen.getByRole('button', { name: 'Grid snapping off' })).toBeInTheDocument()
  })

  it('a snap change in the shell reaches the settings port', () => {
    const port = new InMemorySettingsPort()
    renderShell(createSettingsService(port))

    fireEvent.click(screen.getByRole('button', { name: 'Grid snapping on' }))

    expect(screen.getByRole('button', { name: 'Grid snapping off' })).toBeInTheDocument()
    expect(port.read(SETTING_NAME)).toEqual({
      ...DEFAULT_SNAP_PREFERENCES,
      kinds: { ...DEFAULT_SNAP_PREFERENCES.kinds, grid: false },
    })
  })

  it('with no settings above it the shell calls no browser storage', () => {
    renderShell()

    fireEvent.click(screen.getByRole('button', { name: 'Grid snapping on' }))

    expect(screen.getByRole('button', { name: 'Grid snapping off' })).toBeInTheDocument()
    expect(browser.reads).not.toHaveBeenCalled()
    expect(browser.writes).not.toHaveBeenCalled()
    expect(browser.removals).not.toHaveBeenCalled()
  })
})
