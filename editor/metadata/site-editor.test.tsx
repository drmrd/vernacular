import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  setSiteLocation,
  setSiteNorthBearing,
  setSiteTimezone,
  type Command,
  type SetSiteNorthBearingParams,
  type Site,
} from '../../core'
import { SiteEditor } from './site-editor'

const SITE: Site = { latLong: { latitude: 42.36, longitude: -71.06 } }
const QUARTER_TURN_RADIANS = Math.PI / 2
const RADIANS_PER_DEGREE = Math.PI / 180

afterEach(cleanup)

describe('SiteEditor', () => {
  it('shows the current latitude and longitude', () => {
    render(<SiteEditor site={SITE} dispatch={vi.fn()} />)
    expect(screen.getByLabelText(/latitude/i)).toHaveValue(42.36)
    expect(screen.getByLabelText(/longitude/i)).toHaveValue(-71.06)
  })

  it('dispatches a location update when the coordinates are committed', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    render(<SiteEditor site={SITE} dispatch={dispatch} />)

    const latitude = screen.getByLabelText(/latitude/i)
    await user.clear(latitude)
    await user.type(latitude, '40{Enter}')

    const sent = dispatch.mock.calls[0]?.[0] as Command
    expect(sent.type).toBe(setSiteLocation({ latitude: 40, longitude: -71.06 }).type)
  })

  it('dispatches a location update when the latitude field loses focus', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    render(<SiteEditor site={SITE} dispatch={dispatch} />)

    const latitude = screen.getByLabelText(/latitude/i)
    await user.clear(latitude)
    await user.type(latitude, '40')
    await user.tab()

    expect(dispatch).toHaveBeenCalledTimes(1)
    const sent = dispatch.mock.calls[0]?.[0] as Command
    expect(sent.type).toBe(setSiteLocation({ latitude: 40, longitude: -71.06 }).type)
  })

  it('does not dispatch again when a coordinate field blurs right after Enter already committed', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    render(<SiteEditor site={SITE} dispatch={dispatch} />)

    const latitude = screen.getByLabelText(/latitude/i)
    await user.clear(latitude)
    await user.type(latitude, '40{Enter}')
    await user.tab()

    expect(dispatch).toHaveBeenCalledTimes(1)
  })

  it('shows the current north bearing in degrees', () => {
    render(<SiteEditor site={{ ...SITE, northBearing: QUARTER_TURN_RADIANS }} dispatch={vi.fn()} />)
    expect(screen.getByLabelText(/north bearing/i)).toHaveValue(90)
  })

  it('dispatches a north bearing update in radians when committed', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    render(<SiteEditor site={SITE} dispatch={dispatch} />)

    const bearing = screen.getByLabelText(/north bearing/i)
    await user.clear(bearing)
    await user.type(bearing, '45{Enter}')

    const sent = dispatch.mock.calls[0]?.[0] as Command<SetSiteNorthBearingParams>
    expect(sent.type).toBe(setSiteNorthBearing(0).type)
    expect(sent.params.northBearing).toBeCloseTo(45 * RADIANS_PER_DEGREE)
  })

  it('does not dispatch a bearing update when the field is cleared', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    render(
      <SiteEditor site={{ ...SITE, northBearing: QUARTER_TURN_RADIANS }} dispatch={dispatch} />,
    )

    const bearing = screen.getByLabelText(/north bearing/i)
    await user.clear(bearing)
    await user.keyboard('{Enter}')

    expect(dispatch).not.toHaveBeenCalled()
  })

  it('does not dispatch a location update when a coordinate field is cleared', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    render(<SiteEditor site={SITE} dispatch={dispatch} />)

    const latitude = screen.getByLabelText(/latitude/i)
    await user.clear(latitude)
    await user.keyboard('{Enter}')

    expect(dispatch).not.toHaveBeenCalled()
  })

  it('does not dispatch a location update when the partner coordinate is cleared', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    render(<SiteEditor site={SITE} dispatch={dispatch} />)

    await user.clear(screen.getByLabelText(/longitude/i))

    const latitude = screen.getByLabelText(/latitude/i)
    await user.clear(latitude)
    await user.type(latitude, '40{Enter}')

    expect(dispatch).not.toHaveBeenCalled()
  })

  it('dispatches setSiteTimezone on commit', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    render(<SiteEditor site={{}} dispatch={dispatch} />)

    await user.type(screen.getByLabelText(/timezone/i), 'America/New_York{Enter}')

    const command = dispatch.mock.calls.at(-1)?.[0]
    expect(command?.type).toBe(setSiteTimezone('America/New_York').type)
    expect(command?.params).toEqual({ timezone: 'America/New_York' })
  })
})
