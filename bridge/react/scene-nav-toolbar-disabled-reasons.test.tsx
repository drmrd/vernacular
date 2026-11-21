import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { SceneNavToolbar } from './scene-nav-toolbar'

// An unavailable toolbar control stays focusable and hands its reason to assistive
// technology as its accessible description, so a keyboard or screen-reader user who
// reaches it learns why it does nothing right now. Native `disabled` cannot do that:
// a disabled button leaves the tab order and the reason sits only in the hover title.

afterEach(cleanup)

const baseProps = {
  mode: 'orbit' as const,
  onModeChange: vi.fn(),
  onReset: vi.fn(),
  colorTemperatureK: 6500,
  onColorTemperatureChange: vi.fn(),
}

const PRESET_REASON =
  'Poses the orbit camera. Walk mode would overwrite the pose on the next frame.'
const RESET_REASON =
  'Refits the orbit camera to the model. Walk mode would overwrite the framing on the next frame.'
const SELECT_REASON = 'Picks with the orbit camera. A walk-mode click engages mouse-look instead.'
const REVEAL_REASON =
  'Thins the walls between the orbit camera and the rooms. Walk mode is already inside them.'
const NO_DOOR_REASON =
  'No door in view to frame. Add a door, or show the floor its doors are on, to use this preset.'
const UNDERGROUND_REASON =
  'Applies to the whole-building view. Choose Whole building to show or hide the levels below grade.'

function expectUnavailableWithReason(name: string, reason: string): void {
  const button = screen.getByRole('button', { name })

  expect(button).toHaveAttribute('aria-disabled', 'true')
  button.focus()
  expect(button).toHaveFocus()
  expect(button).toHaveAccessibleDescription(reason)
}

describe('SceneNavToolbar walk-mode camera controls', () => {
  it.each([
    ['Top down', PRESET_REASON],
    ['North', PRESET_REASON],
    ['South', PRESET_REASON],
    ['East', PRESET_REASON],
    ['West', PRESET_REASON],
    ['Doorway', PRESET_REASON],
    ['Reset view', RESET_REASON],
  ])('keeps %s focusable and describes why walk mode makes it unavailable', (name, reason) => {
    render(
      <SceneNavToolbar
        {...baseProps}
        mode="walk"
        doorway={{ name: 'single swing door', selected: false }}
      />,
    )

    expectUnavailableWithReason(name, reason)
  })
})

describe('SceneNavToolbar walk-mode orbit-only toggles', () => {
  it.each([
    ['Select', SELECT_REASON],
    ['Reveal interior', REVEAL_REASON],
  ])('keeps %s focusable and describes why walk mode makes it unavailable', (name, reason) => {
    render(<SceneNavToolbar {...baseProps} mode="walk" />)

    expectUnavailableWithReason(name, reason)
  })
})

describe('SceneNavToolbar Doorway preset without a door', () => {
  it('keeps Doorway focusable and describes that no door is in view', () => {
    render(<SceneNavToolbar {...baseProps} mode="orbit" doorway={null} />)

    expectUnavailableWithReason('Doorway', NO_DOOR_REASON)
  })
})

describe('SceneNavToolbar underground levels in the active-floor scope', () => {
  it('keeps Underground levels focusable and describes that it applies to the whole building', () => {
    render(<SceneNavToolbar {...baseProps} scope="floor" />)

    expectUnavailableWithReason('Underground levels', UNDERGROUND_REASON)
  })
})
