import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, within, cleanup, fireEvent } from '@testing-library/react'
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

describe('EnvironmentPanel observation date and time', () => {
  it('seeds the observation date-and-time input from observedAt and reports the parsed instant on change', () => {
    const environment: EnvironmentState = {
      ...DEFAULT_ENVIRONMENT_STATE,
      observedAt: { date: '2026-06-21', minutesSinceMidnight: 720 },
    }
    const onEnvironmentChange = vi.fn()
    render(
      <EnvironmentPanel
        site={SITE_WITH_TIMEZONE}
        environment={environment}
        onEnvironmentChange={onEnvironmentChange}
      />,
    )

    const input = screen.getByLabelText(/observation date and time/i)
    expect(input).toHaveValue('2026-06-21T12:00')

    fireEvent.change(input, { target: { value: '2026-12-04T16:00' } })

    expect(onEnvironmentChange).toHaveBeenCalledWith({
      ...environment,
      observedAt: { date: '2026-12-04', minutesSinceMidnight: 960 },
    })
  })

  it('does not call onEnvironmentChange when the observation date-and-time input is cleared', () => {
    const environment: EnvironmentState = {
      ...DEFAULT_ENVIRONMENT_STATE,
      observedAt: { date: '2026-06-21', minutesSinceMidnight: 720 },
    }
    const onEnvironmentChange = vi.fn()
    render(
      <EnvironmentPanel
        site={SITE_WITH_TIMEZONE}
        environment={environment}
        onEnvironmentChange={onEnvironmentChange}
      />,
    )

    fireEvent.change(screen.getByLabelText(/observation date and time/i), {
      target: { value: '' },
    })

    expect(onEnvironmentChange).not.toHaveBeenCalled()
  })

  it('seeds a time-of-day slider from minutesSinceMidnight and preserves the date when it changes', () => {
    const environment: EnvironmentState = {
      ...DEFAULT_ENVIRONMENT_STATE,
      observedAt: { date: '2026-06-21', minutesSinceMidnight: 720 },
    }
    const onEnvironmentChange = vi.fn()
    render(
      <EnvironmentPanel
        site={SITE_WITH_TIMEZONE}
        environment={environment}
        onEnvironmentChange={onEnvironmentChange}
      />,
    )

    const slider = screen.getByRole('slider', { name: /time of day/i })
    expect(slider).toHaveAttribute('min', '0')
    expect(slider).toHaveAttribute('max', '1439')
    expect(slider).toHaveValue('720')

    fireEvent.change(slider, { target: { value: '510' } })

    expect(onEnvironmentChange).toHaveBeenCalledWith({
      ...environment,
      observedAt: { date: '2026-06-21', minutesSinceMidnight: 510 },
    })
  })
})

describe('EnvironmentPanel cloud cover', () => {
  it('renders a cloud-cover dial seeded from cloudCover with a percentage readout', () => {
    const environment: EnvironmentState = { ...DEFAULT_ENVIRONMENT_STATE, cloudCover: 0.6 }
    render(
      <EnvironmentPanel
        site={SITE_WITH_TIMEZONE}
        environment={environment}
        onEnvironmentChange={vi.fn()}
      />,
    )

    const dial = screen.getByRole('slider', { name: /cloud cover/i })
    expect(dial).toHaveAttribute('min', '0')
    expect(dial).toHaveAttribute('max', '1')
    expect(dial).toHaveValue('0.6')
    expect(screen.getByText('60%')).toBeInTheDocument()
  })

  it('reports a cloud-cover change when the dial moves', () => {
    const environment: EnvironmentState = { ...DEFAULT_ENVIRONMENT_STATE, cloudCover: 0.4 }
    const onEnvironmentChange = vi.fn()
    render(
      <EnvironmentPanel
        site={SITE_WITH_TIMEZONE}
        environment={environment}
        onEnvironmentChange={onEnvironmentChange}
      />,
    )

    fireEvent.change(screen.getByRole('slider', { name: /cloud cover/i }), {
      target: { value: '0.6' },
    })

    expect(onEnvironmentChange).toHaveBeenCalledWith({ ...environment, cloudCover: 0.6 })
  })
})
