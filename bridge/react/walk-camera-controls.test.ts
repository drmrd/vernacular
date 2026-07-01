import { describe, expect, it, vi } from 'vitest'

import { emptyOpeningInteraction, isOpeningOpen, type OpeningInteractionState } from '../../core'

import { walkKeyHandlers } from './walk-camera-controls'

const DOOR_ID = 'opening:front-door'

// The KeyR branch touches only `interaction` and `onUserControl`, so a minimal
// stand-in for the (unexported) WalkSession carries just those two real fields.
function sessionWith(interaction: OpeningInteractionState) {
  return {
    interaction: { current: interaction },
    onUserControl: vi.fn(),
  }
}

function handlersFor(session: ReturnType<typeof sessionWith>) {
  return walkKeyHandlers(session as unknown as Parameters<typeof walkKeyHandlers>[0])
}

describe('walk camera controls: reset key', () => {
  it('resets every open opening to closed and marks user control when KeyR is pressed', () => {
    const session = sessionWith({ openIds: new Set([DOOR_ID]) })

    handlersFor(session).onKeyDown(new KeyboardEvent('keydown', { code: 'KeyR' }))

    expect(session.interaction.current).toEqual(emptyOpeningInteraction())
    expect(session.onUserControl).toHaveBeenCalledTimes(1)
  })

  it('leaves openings untouched and does not mark control for an unmapped key', () => {
    const session = sessionWith({ openIds: new Set([DOOR_ID]) })

    handlersFor(session).onKeyDown(new KeyboardEvent('keydown', { code: 'KeyZ' }))

    expect(isOpeningOpen(session.interaction.current, DOOR_ID)).toBe(true)
    expect(session.onUserControl).not.toHaveBeenCalled()
  })
})
