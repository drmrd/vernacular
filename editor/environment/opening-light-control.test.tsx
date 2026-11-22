import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DEFAULT_ENVIRONMENT_STATE,
  clearOpeningLight,
  setOpeningLight,
  type EnvironmentState,
  type OpeningLight,
} from '../../core'
import { OpeningLightControl } from './opening-light-control'

afterEach(cleanup)

const USE_BUTTON = /use this light when the project opens/i
const CLEAR_BUTTON = /clear the opening light/i
const DEFAULT_LIGHT_STATUS = 'Opens in the default light.'

const MORNING_MINUTES = 480
const EVENING_MINUTES = 1080
const PARTLY_CLOUDY = 0.4
const OVERCAST = 1
const CLEAR = 0
const HEAVY_CLOUD = 0.9

const MORNING_ENVIRONMENT: EnvironmentState = {
  ...DEFAULT_ENVIRONMENT_STATE,
  observedAt: { date: '2026-06-21', minutesSinceMidnight: MORNING_MINUTES },
  cloudCover: CLEAR,
}

const EVENING_ENVIRONMENT: EnvironmentState = {
  ...DEFAULT_ENVIRONMENT_STATE,
  observedAt: { date: '2026-12-21', minutesSinceMidnight: EVENING_MINUTES },
  cloudCover: HEAVY_CLOUD,
}

function storedLight(cloudCover?: number): OpeningLight {
  return cloudCover === undefined
    ? { observedAt: '2026-06-21T08:00' }
    : { observedAt: '2026-06-21T08:00', weather: { cloudCover } }
}

function renderControl(
  openingLight: OpeningLight | undefined,
  dispatch = vi.fn(),
  environment: EnvironmentState = MORNING_ENVIRONMENT,
) {
  return render(
    <OpeningLightControl
      environment={environment}
      openingLight={openingLight}
      dispatch={dispatch}
    />,
  )
}

describe('OpeningLightControl with no stored light', () => {
  it('reads the default light, enables the store button, and disables the clear button', () => {
    renderControl(undefined)

    expect(screen.getByRole('status').textContent).toBe(DEFAULT_LIGHT_STATUS)
    expect((screen.getByRole('button', { name: USE_BUTTON }) as HTMLButtonElement).disabled).toBe(
      false,
    )
    expect((screen.getByRole('button', { name: CLEAR_BUTTON }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })
})

describe('OpeningLightControl storing the light on screen', () => {
  it('dispatches one set command with the observed instant and cloud cover when the button is clicked', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderControl(undefined, dispatch)

    await user.click(screen.getByRole('button', { name: USE_BUTTON }))

    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls[0]?.[0]).toEqual(
      setOpeningLight({ observedAt: '2026-06-21T08:00', weather: { cloudCover: CLEAR } }),
    )
  })

  it('dispatches nothing when the environment changes on a rerender', () => {
    const dispatch = vi.fn()
    const { rerender } = renderControl(undefined, dispatch)

    rerender(
      <OpeningLightControl
        environment={EVENING_ENVIRONMENT}
        openingLight={undefined}
        dispatch={dispatch}
      />,
    )

    expect(dispatch).not.toHaveBeenCalled()
  })
})

describe('OpeningLightControl status line', () => {
  it('names the stored date, time, and clear sky', () => {
    renderControl(storedLight(CLEAR))

    expect(screen.getByRole('status').textContent).toBe('Opens at 21 June 2026, 08:00, clear sky.')
  })

  it('names an overcast sky for full cloud cover', () => {
    renderControl(storedLight(OVERCAST))

    expect(screen.getByRole('status').textContent).toBe(
      'Opens at 21 June 2026, 08:00, overcast sky.',
    )
  })

  it('names the cloud cover percent for partial cloud', () => {
    renderControl(storedLight(PARTLY_CLOUDY))

    expect(screen.getByRole('status').textContent).toBe(
      'Opens at 21 June 2026, 08:00, 40% cloud cover.',
    )
  })

  it('reads clear sky when the stored light has no weather', () => {
    renderControl(storedLight())

    expect(screen.getByRole('status').textContent).toBe('Opens at 21 June 2026, 08:00, clear sky.')
  })

  it('reads the default light when the stored instant is malformed, and still allows clearing it', () => {
    renderControl({ observedAt: 'noon' })

    expect(screen.getByRole('status').textContent).toBe(DEFAULT_LIGHT_STATUS)
    expect((screen.getByRole('button', { name: CLEAR_BUTTON }) as HTMLButtonElement).disabled).toBe(
      false,
    )
  })
})

describe('OpeningLightControl clearing the stored light', () => {
  it('dispatches one clear command when the clear button is clicked', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderControl(storedLight(CLEAR), dispatch)

    await user.click(screen.getByRole('button', { name: CLEAR_BUTTON }))

    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls[0]?.[0]).toEqual(clearOpeningLight())
  })
})
