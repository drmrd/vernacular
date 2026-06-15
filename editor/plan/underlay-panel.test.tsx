import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, within, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  REMOVE_UNDERLAY,
  SET_UNDERLAY_OPACITY,
  SET_UNDERLAY_VISIBILITY,
  createUnderlay,
  type AssetReference,
  type Command,
  type RemoveUnderlayParams,
  type SetUnderlayVisibilityParams,
  type Underlay,
} from '../../core'
import { UnderlayPanel } from './underlay-panel'

// A known floor and a single underlay built from the factory so it carries a
// real id, opacity 1, and visible true. Fixed values keep the dispatched
// command payloads deterministic.
const FLOOR_ID = 'g'
const IMAGE: AssetReference = { scope: 'project', contentHash: 'deadbeef' }
const UNDERLAY_WIDTH = 1024
const UNDERLAY_HEIGHT = 768

// A new opacity entered through the opacity control. Distinct from the
// factory default (1) so the dispatched value is unambiguous.
const NEW_OPACITY = 0.5

function newUnderlay(): Underlay {
  return createUnderlay({ image: IMAGE, width: UNDERLAY_WIDTH, height: UNDERLAY_HEIGHT })
}

interface RenderResult {
  dispatch: ReturnType<typeof vi.fn>
  onLoadImage: ReturnType<typeof vi.fn>
  onCalibrate: ReturnType<typeof vi.fn>
}

function renderPanel(underlays: readonly Underlay[]): RenderResult {
  const dispatch = vi.fn()
  const onLoadImage = vi.fn()
  const onCalibrate = vi.fn()
  render(
    <UnderlayPanel
      floorId={FLOOR_ID}
      underlays={underlays}
      dispatch={dispatch}
      onLoadImage={onLoadImage}
      onCalibrate={onCalibrate}
    />,
  )
  return { dispatch, onLoadImage, onCalibrate }
}

function lastCommand<P>(dispatch: ReturnType<typeof vi.fn>): Command<P> {
  return dispatch.mock.calls[0]?.[0] as Command<P>
}

afterEach(cleanup)

describe('UnderlayPanel', () => {
  it('lists one control group per underlay with its opacity, visibility, calibrate, and remove controls', () => {
    const first = newUnderlay()
    const second = newUnderlay()
    renderPanel([first, second])

    const groups = screen.getAllByRole('group')
    expect(groups).toHaveLength(2)

    for (const group of groups) {
      const scoped = within(group)
      expect(scoped.getByLabelText(/opacity/i)).toBeInTheDocument()
      expect(scoped.getByRole('checkbox', { name: /visible/i })).toBeInTheDocument()
      expect(scoped.getByRole('button', { name: /calibrate/i })).toBeInTheDocument()
      expect(scoped.getByRole('button', { name: /remove/i })).toBeInTheDocument()
    }
  })

  it('dispatches exactly one setUnderlayOpacity when the opacity control changes to a new value', () => {
    const underlay = newUnderlay()
    const { dispatch } = renderPanel([underlay])

    const opacity = screen.getByLabelText(/opacity/i)
    fireEvent.change(opacity, { target: { value: String(NEW_OPACITY) } })

    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: SET_UNDERLAY_OPACITY,
        params: { floorId: FLOOR_ID, underlayId: underlay.id, opacity: NEW_OPACITY },
      }),
    )
  })

  it('dispatches exactly one setUnderlayVisibility with the flipped visibility when the visibility control is toggled', async () => {
    const underlay = newUnderlay()
    const user = userEvent.setup()
    const { dispatch } = renderPanel([underlay])

    // The factory underlay starts visible; toggling flips it to hidden.
    await user.click(screen.getByRole('checkbox', { name: /visible/i }))

    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(lastCommand<SetUnderlayVisibilityParams>(dispatch).type).toBe(SET_UNDERLAY_VISIBILITY)
    expect(lastCommand<SetUnderlayVisibilityParams>(dispatch).params).toEqual({
      floorId: FLOOR_ID,
      underlayId: underlay.id,
      visible: false,
    })
  })

  it('dispatches exactly one removeUnderlay when the remove control is pressed', async () => {
    const underlay = newUnderlay()
    const user = userEvent.setup()
    const { dispatch } = renderPanel([underlay])

    await user.click(screen.getByRole('button', { name: /remove/i }))

    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(lastCommand<RemoveUnderlayParams>(dispatch).type).toBe(REMOVE_UNDERLAY)
    expect(lastCommand<RemoveUnderlayParams>(dispatch).params).toEqual({
      floorId: FLOOR_ID,
      underlayId: underlay.id,
    })
  })

  it('invokes onCalibrate with the underlay id and dispatches nothing when Calibrate is pressed', async () => {
    const underlay = newUnderlay()
    const user = userEvent.setup()
    const { dispatch, onCalibrate } = renderPanel([underlay])

    await user.click(screen.getByRole('button', { name: /calibrate/i }))

    expect(onCalibrate).toHaveBeenCalledTimes(1)
    expect(onCalibrate).toHaveBeenCalledWith(underlay.id)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('invokes onLoadImage when the load-image control is pressed', async () => {
    const user = userEvent.setup()
    const { onLoadImage } = renderPanel([])

    await user.click(screen.getByRole('button', { name: /load image/i }))

    expect(onLoadImage).toHaveBeenCalledTimes(1)
  })

  it('renders its action controls as design-system buttons', () => {
    renderPanel([newUnderlay()])
    for (const name of [/load image/i, /calibrate/i, /remove/i]) {
      expect(screen.getByRole('button', { name })).toHaveClass('ds-button')
    }
  })
})
