import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Underlay } from '../../core'
import { UnderlayMenu } from './underlay-menu'

afterEach(cleanup)

// Some engines report a key of a composition as key code 229 instead of isComposing.
const COMPOSITION_KEY_CODE = 229

async function openFlyoutOnKnownDistanceField() {
  const underlay = { id: 'u1', opacity: 0.5, visible: true } as Underlay
  render(
    <UnderlayMenu
      floorId="ground"
      underlays={[underlay]}
      dispatch={vi.fn()}
      onLoadImage={vi.fn()}
      onCalibrate={vi.fn()}
      armedUnderlayId="u1"
      knownDistance=""
      onKnownDistanceChange={vi.fn()}
    />,
  )
  const trigger = screen.getByRole('button', { name: /underlay/i })
  await userEvent.click(trigger)
  const input = screen.getByLabelText(/known distance/i)
  input.focus()
  return { trigger, input }
}

// The user-event library does not model input-method composition, so the keys of a
// composition are fired as raw keydown events with the init that a browser sends.
describe('an Escape of a text composition in the underlay flyout', () => {
  it('keeps the flyout open on an Escape marked as composing', async () => {
    const { trigger, input } = await openFlyoutOnKnownDistanceField()

    fireEvent.keyDown(input, { key: 'Escape', isComposing: true })

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  it('keeps the flyout open on an Escape with the legacy composition key code', async () => {
    const { trigger, input } = await openFlyoutOnKnownDistanceField()

    fireEvent.keyDown(input, { key: 'Escape', keyCode: COMPOSITION_KEY_CODE })

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  it('closes the flyout on the plain Escape after a composing Escape', async () => {
    const { trigger, input } = await openFlyoutOnKnownDistanceField()

    fireEvent.keyDown(input, { key: 'Escape', isComposing: true })
    await userEvent.keyboard('{Escape}')

    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })
})
