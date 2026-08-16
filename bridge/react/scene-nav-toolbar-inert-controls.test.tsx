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
