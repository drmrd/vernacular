import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { SceneNavToolbar } from './scene-nav-toolbar'

// The toolbar controls that reach the render in some states and not others, gathered here
// so each stays pinned to the state it actually changes something in. A control that
// responds while changing nothing is the defect this file guards against.

afterEach(cleanup)

const baseProps = {
  mode: 'orbit' as const,
  onModeChange: vi.fn(),
  onReset: vi.fn(),
  colorTemperatureK: 6500,
  onColorTemperatureChange: vi.fn(),
}

describe('SceneNavToolbar color-temperature honesty', () => {
  it('disables the color-temperature slider under realistic lighting, where the sun and sky set the light color', () => {
    render(<SceneNavToolbar {...baseProps} lightingMode="realistic" />)

    expect(screen.getByRole('slider', { name: /color temperature/i })).toBeDisabled()
    expect(screen.getByText(/sun and sky/i)).toBeInTheDocument()
  })

  it('disables the color-temperature slider while the color check holds the light at the reference white', () => {
    render(<SceneNavToolbar {...baseProps} colorCheck />)

    expect(screen.getByRole('slider', { name: /color temperature/i })).toBeDisabled()
    expect(screen.getByText(/reference white/i)).toBeInTheDocument()
  })

  it('keeps the slider live in schematic mode, the one mode whose rig it tints', () => {
    render(<SceneNavToolbar {...baseProps} lightingMode="schematic" />)

    expect(screen.getByRole('slider', { name: /color temperature/i })).toBeEnabled()
    expect(screen.queryByText(/sun and sky/i)).toBeNull()
  })
})

describe('SceneNavToolbar orbit-only toggles in walk mode', () => {
  it('disables the select toggle in walk mode, where a canvas click only engages mouse-look', () => {
    render(<SceneNavToolbar {...baseProps} mode="walk" selectionEnabled />)

    const toggle = screen.getByRole('button', { name: 'Select' })
    expect(toggle).toBeDisabled()
    expect(toggle.getAttribute('title')).toMatch(/orbit camera/i)
  })

  it('disables the reveal-interior toggle in walk mode, where the near-wall fade never runs', () => {
    render(<SceneNavToolbar {...baseProps} mode="walk" revealInterior />)

    const toggle = screen.getByRole('button', { name: 'Reveal interior' })
    expect(toggle).toBeDisabled()
    expect(toggle.getAttribute('title')).toMatch(/orbit camera/i)
  })

  it('keeps both toggles live in orbit mode, where each reaches the render', () => {
    render(<SceneNavToolbar {...baseProps} mode="orbit" />)

    expect(screen.getByRole('button', { name: 'Select' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Reveal interior' })).toBeEnabled()
  })
})

describe('SceneNavToolbar camera controls in walk mode', () => {
  // doorway is passed throughout so Doorway's walk-mode disablement proves the new
  // reason (the walk frame loop overwrites any pose these buttons set), not the
  // pre-existing doorway={null} reason.
  const cameraControlNames = ['Top down', 'North', 'South', 'East', 'West', 'Doorway', 'Reset view']

  it('disables the camera-preset and reset-view buttons in walk mode, where the walk frame loop overwrites any pose they set', () => {
    render(
      <SceneNavToolbar
        {...baseProps}
        mode="walk"
        doorway={{ name: 'single swing door', selected: false }}
      />,
    )

    cameraControlNames.forEach((name) => {
      const button = screen.getByRole('button', { name })
      expect(button).toBeDisabled()
      expect(button.getAttribute('title')).toMatch(/orbit camera/i)
    })
  })

  it('keeps the camera-preset and reset-view buttons live in orbit mode, where each still reaches the render', () => {
    render(
      <SceneNavToolbar
        {...baseProps}
        mode="orbit"
        doorway={{ name: 'single swing door', selected: false }}
      />,
    )

    cameraControlNames.forEach((name) => {
      expect(screen.getByRole('button', { name })).toBeEnabled()
    })
  })
})

describe('SceneNavToolbar doorway preset self-explanation', () => {
  it('names the available door in the Doorway button title when a door is found', () => {
    render(
      <SceneNavToolbar
        {...baseProps}
        mode="orbit"
        doorway={{ name: 'french door', selected: false }}
      />,
    )

    const button = screen.getByRole('button', { name: 'Doorway' })
    expect(button).toBeEnabled()
    expect(button.getAttribute('title')).toMatch(/french door/)
  })

  it("credits the user's own selection in the Doorway button title when framing follows it", () => {
    render(
      <SceneNavToolbar
        {...baseProps}
        mode="orbit"
        doorway={{ name: 'pocket door', selected: true }}
      />,
    )

    const button = screen.getByRole('button', { name: 'Doorway' })
    expect(button.getAttribute('title')).toMatch(/pocket door/)
    expect(button.getAttribute('title')).toMatch(/selected/i)
  })

  it('explains in the Doorway button title that no door exists in the view when it is disabled', () => {
    render(<SceneNavToolbar {...baseProps} mode="orbit" doorway={null} />)

    const button = screen.getByRole('button', { name: 'Doorway' })
    expect(button).toBeDisabled()
    expect(button.getAttribute('title')).toMatch(/no door/i)
  })
})
