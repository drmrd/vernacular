import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setSiteLocation, type Command, type Site } from '../../core'
import { SiteEditor } from './site-editor'

const SITE: Site = { latLong: { latitude: 42.36, longitude: -71.06 } }

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
})
