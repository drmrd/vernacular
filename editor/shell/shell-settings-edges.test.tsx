import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { SettingsProvider } from '../../bridge'
import { createSettingsService } from '../../session'
import { InMemorySettingsPort } from '../../session/testing'
import { stubEmptyBrowserStorage } from '../design-system/browser-environment-test-support'
import { DEFAULT_SNAP_PREFERENCES, type SnapPreferences } from '../plan/snap-preferences'
import { SETTING_NAME, shellWithProbe } from './shell-settings-test-support'

/** A catch radius that the first service holds and no default has, so that its port is told apart. */
const RADIUS_OF_A = 30

beforeEach(() => {
  stubEmptyBrowserStorage()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** Preferences like the defaults, with grid snapping set to `grid`. */
function preferencesWithGrid(grid: boolean): SnapPreferences {
  return { ...DEFAULT_SNAP_PREFERENCES, kinds: { ...DEFAULT_SNAP_PREFERENCES.kinds, grid } }
}

describe('the snap preferences of the shell when the settings above it change', () => {
  it('shows the value of the new service, and a change reaches the new port only', () => {
    const storedByA: SnapPreferences = { ...preferencesWithGrid(false), pixelRadius: RADIUS_OF_A }
    const portA = new InMemorySettingsPort()
    portA.write(SETTING_NAME, storedByA)
    const portB = new InMemorySettingsPort()
    portB.write(SETTING_NAME, preferencesWithGrid(true))
    const shell = shellWithProbe()
    const { rerender } = render(
      <SettingsProvider service={createSettingsService(portA)}>{shell}</SettingsProvider>,
    )
    expect(screen.getByRole('button', { name: 'Grid snapping off' })).toBeInTheDocument()

    rerender(<SettingsProvider service={createSettingsService(portB)}>{shell}</SettingsProvider>)

    expect(screen.getByRole('button', { name: 'Grid snapping on' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Grid snapping on' }))
    expect(screen.getByRole('button', { name: 'Grid snapping off' })).toBeInTheDocument()
    expect(portB.read(SETTING_NAME)).toEqual(preferencesWithGrid(false))
    expect(portA.read(SETTING_NAME)).toEqual(storedByA)
  })
})
