import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DEFAULT_ENVIRONMENT_STATE, type EnvironmentState, type Site } from '../../core'
import { EnvironmentPanel } from './environment-panel'

const SITE_WITH_TIMEZONE: Site = {
  latLong: { latitude: 42.36, longitude: -71.06 },
  timezone: 'America/New_York',
}

const SITE_WITHOUT_TIMEZONE: Site = {
  latLong: { latitude: 42.36, longitude: -71.06 },
}

const MISSING_LOCATION_NOTICE =
  'Realistic lighting needs the site location. Set latitude and longitude in the Site panel; ' +
  'until then the view falls back to schematic lighting.'

const MISSING_TIMEZONE_NOTICE =
  'The site has no timezone, so solar time is estimated from its longitude. Set the timezone ' +
  'in the Site panel for exact sun angles.'

afterEach(cleanup)

describe('EnvironmentPanel', () => {
  it('calls onEnvironmentChange with the realistic mode while preserving every other field when Realistic is pressed', async () => {
    const environment: EnvironmentState = {
      ...DEFAULT_ENVIRONMENT_STATE,
      cloudCover: 0.4,
      colorCheck: true,
      observedAt: { date: '2026-03-20', minutesSinceMidnight: 600 },
    }
    const onEnvironmentChange = vi.fn()
    const user = userEvent.setup()
    render(
      <EnvironmentPanel
        site={SITE_WITH_TIMEZONE}
        environment={environment}
        onEnvironmentChange={onEnvironmentChange}
      />,
    )

    const modeGroup = screen.getByRole('group', { name: /lighting mode/i })
    await user.click(within(modeGroup).getByRole('button', { name: 'Realistic' }))

    expect(onEnvironmentChange).toHaveBeenCalledWith({ ...environment, mode: 'realistic' })
  })

  it('shows the site coordinates and timezone with no missing-location notice when the site has a location and timezone', () => {
    render(
      <EnvironmentPanel
        site={SITE_WITH_TIMEZONE}
        environment={{ ...DEFAULT_ENVIRONMENT_STATE, mode: 'realistic' }}
        onEnvironmentChange={vi.fn()}
      />,
    )

    expect(screen.getByText(/42\.36/)).toBeInTheDocument()
    expect(screen.getByText(/-71\.06/)).toBeInTheDocument()
    expect(screen.getByText(/America\/New_York/)).toBeInTheDocument()
    expect(screen.queryByText(MISSING_LOCATION_NOTICE)).toBeNull()
  })

  it('shows the missing-location notice when realistic mode is selected and the site has no coordinates', () => {
    render(
      <EnvironmentPanel
        site={undefined}
        environment={{ ...DEFAULT_ENVIRONMENT_STATE, mode: 'realistic' }}
        onEnvironmentChange={vi.fn()}
      />,
    )

    expect(screen.getByText(MISSING_LOCATION_NOTICE)).toBeInTheDocument()
  })

  it('does not show the missing-location notice in schematic mode even when the site has no coordinates', () => {
    render(
      <EnvironmentPanel
        site={undefined}
        environment={{ ...DEFAULT_ENVIRONMENT_STATE, mode: 'schematic' }}
        onEnvironmentChange={vi.fn()}
      />,
    )

    expect(screen.queryByText(MISSING_LOCATION_NOTICE)).toBeNull()
  })

  it('shows the missing-timezone notice when realistic mode is selected and the site has coordinates but no timezone', () => {
    render(
      <EnvironmentPanel
        site={SITE_WITHOUT_TIMEZONE}
        environment={{ ...DEFAULT_ENVIRONMENT_STATE, mode: 'realistic' }}
        onEnvironmentChange={vi.fn()}
      />,
    )

    expect(screen.getByText(MISSING_TIMEZONE_NOTICE)).toBeInTheDocument()
  })

  it('does not show the missing-timezone notice in schematic mode even when the site has no timezone', () => {
    render(
      <EnvironmentPanel
        site={SITE_WITHOUT_TIMEZONE}
        environment={{ ...DEFAULT_ENVIRONMENT_STATE, mode: 'schematic' }}
        onEnvironmentChange={vi.fn()}
      />,
    )

    expect(screen.queryByText(MISSING_TIMEZONE_NOTICE)).toBeNull()
  })

  it('shows that the location is not set when the site has no coordinates', () => {
    render(
      <EnvironmentPanel
        site={undefined}
        environment={DEFAULT_ENVIRONMENT_STATE}
        onEnvironmentChange={vi.fn()}
      />,
    )

    expect(screen.getByText('Location: not set')).toBeInTheDocument()
  })
})
