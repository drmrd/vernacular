import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SceneNavToolbar } from './scene-nav-toolbar'
import {
  formatColorTemperature,
  MIN_COLOR_TEMPERATURE_K,
  MAX_COLOR_TEMPERATURE_K,
} from '../../core'

afterEach(cleanup)

describe('SceneNavToolbar', () => {
  it('renders orbit, walk, and reset controls inside a navigation toolbar', () => {
    render(
      <SceneNavToolbar
        mode="orbit"
        onModeChange={vi.fn()}
        onReset={vi.fn()}
        colorTemperatureK={6500}
        onColorTemperatureChange={vi.fn()}
      />,
    )

    const toolbar = screen.getByRole('toolbar', { name: /navigation/i })
    expect(toolbar).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Orbit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Walk' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset view' })).toBeInTheDocument()
  })

  it('marks the active mode button as pressed and the inactive one as not pressed', () => {
    render(
      <SceneNavToolbar
        mode="walk"
        onModeChange={vi.fn()}
        onReset={vi.fn()}
        colorTemperatureK={6500}
        onColorTemperatureChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Walk' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Orbit' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('reports a mode change when an inactive mode button is clicked', async () => {
    const onModeChange = vi.fn()
    render(
      <SceneNavToolbar
        mode="orbit"
        onModeChange={onModeChange}
        onReset={vi.fn()}
        colorTemperatureK={6500}
        onColorTemperatureChange={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Walk' }))

    expect(onModeChange).toHaveBeenCalledTimes(1)
    expect(onModeChange).toHaveBeenCalledWith('walk')
  })

  it('reports a reset when the reset control is clicked', async () => {
    const onReset = vi.fn()
    render(
      <SceneNavToolbar
        mode="orbit"
        onModeChange={vi.fn()}
        onReset={onReset}
        colorTemperatureK={6500}
        onColorTemperatureChange={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Reset view' }))

    expect(onReset).toHaveBeenCalledTimes(1)
  })

  it('renders a color-temperature slider spanning the supported kelvin band', () => {
    render(
      <SceneNavToolbar
        mode="orbit"
        onModeChange={vi.fn()}
        onReset={vi.fn()}
        colorTemperatureK={6500}
        onColorTemperatureChange={vi.fn()}
      />,
    )

    const slider = screen.getByRole('slider', { name: /color temperature/i })
    expect(slider).toHaveAttribute('min', '2700')
    expect(slider).toHaveAttribute('max', '6500')
    expect(slider).toHaveValue('6500')
    expect(slider).toHaveAttribute('aria-valuetext', '6500 kelvin')
  })

  it('reports a color-temperature change when the slider moves', () => {
    const onColorTemperatureChange = vi.fn()
    render(
      <SceneNavToolbar
        mode="orbit"
        onModeChange={vi.fn()}
        onReset={vi.fn()}
        colorTemperatureK={6500}
        onColorTemperatureChange={onColorTemperatureChange}
      />,
    )

    fireEvent.change(screen.getByRole('slider', { name: /color temperature/i }), {
      target: { value: '3000' },
    })

    expect(onColorTemperatureChange).toHaveBeenCalledWith(3000)
  })
})

describe('SceneNavToolbar click-select toggle', () => {
  it('renders a select-toggle button that is off by default and toggles on click', async () => {
    const onToggleSelection = vi.fn()
    const { rerender } = render(
      <SceneNavToolbar
        mode="orbit"
        onModeChange={vi.fn()}
        onReset={vi.fn()}
        colorTemperatureK={6500}
        onColorTemperatureChange={vi.fn()}
        selectionEnabled={false}
        onToggleSelection={onToggleSelection}
      />,
    )

    const toggle = screen.getByRole('button', { name: /select/i })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(toggle)
    expect(onToggleSelection).toHaveBeenCalledTimes(1)

    rerender(
      <SceneNavToolbar
        mode="orbit"
        onModeChange={vi.fn()}
        onReset={vi.fn()}
        colorTemperatureK={6500}
        onColorTemperatureChange={vi.fn()}
        selectionEnabled
        onToggleSelection={onToggleSelection}
      />,
    )

    expect(screen.getByRole('button', { name: /select/i })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('SceneNavToolbar color-temperature readout', () => {
  it('shows the live Kelvin value and warm/cool captions while keeping the slider accessible name', () => {
    render(
      <SceneNavToolbar
        mode="orbit"
        onModeChange={vi.fn()}
        onReset={vi.fn()}
        colorTemperatureK={MAX_COLOR_TEMPERATURE_K}
        onColorTemperatureChange={vi.fn()}
      />,
    )

    expect(screen.getByText(formatColorTemperature(MAX_COLOR_TEMPERATURE_K))).toBeInTheDocument()
    expect(screen.getByText('Warm')).toBeInTheDocument()
    expect(screen.getByText('Cool')).toBeInTheDocument()

    const slider = screen.getByRole('slider', { name: /color temperature/i })
    expect(slider).toHaveAttribute('aria-valuetext', '6500 kelvin')
  })

  it('reflects the current prop value in the readout rather than a hardcoded number', () => {
    render(
      <SceneNavToolbar
        mode="orbit"
        onModeChange={vi.fn()}
        onReset={vi.fn()}
        colorTemperatureK={MIN_COLOR_TEMPERATURE_K}
        onColorTemperatureChange={vi.fn()}
      />,
    )

    expect(screen.getByText(formatColorTemperature(MIN_COLOR_TEMPERATURE_K))).toBeInTheDocument()
    expect(
      screen.queryByText(formatColorTemperature(MAX_COLOR_TEMPERATURE_K)),
    ).not.toBeInTheDocument()
  })
})

describe('SceneNavToolbar camera presets', () => {
  it('renders a camera-preset group with the six named view buttons', () => {
    render(
      <SceneNavToolbar
        mode="orbit"
        onModeChange={vi.fn()}
        onReset={vi.fn()}
        colorTemperatureK={6500}
        onColorTemperatureChange={vi.fn()}
        onPreset={vi.fn()}
        canDoorway
      />,
    )

    const presets = screen.getByRole('group', { name: /camera presets/i })
    expect(presets).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Top down' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'North' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'South' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'East' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'West' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Doorway' })).toBeInTheDocument()
  })

  it.each([
    ['Top down', 'top'],
    ['North', 'north'],
    ['South', 'south'],
    ['East', 'east'],
    ['West', 'west'],
  ])('reports the %s preset when its button is clicked', async (label, tag) => {
    const onPreset = vi.fn()
    render(
      <SceneNavToolbar
        mode="orbit"
        onModeChange={vi.fn()}
        onReset={vi.fn()}
        colorTemperatureK={6500}
        onColorTemperatureChange={vi.fn()}
        onPreset={onPreset}
        canDoorway
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: label }))

    expect(onPreset).toHaveBeenCalledTimes(1)
    expect(onPreset).toHaveBeenCalledWith(tag)
  })

  it('reports the doorway preset when the doorway button is enabled and clicked', async () => {
    const onPreset = vi.fn()
    render(
      <SceneNavToolbar
        mode="orbit"
        onModeChange={vi.fn()}
        onReset={vi.fn()}
        colorTemperatureK={6500}
        onColorTemperatureChange={vi.fn()}
        onPreset={onPreset}
        canDoorway
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Doorway' }))

    expect(onPreset).toHaveBeenCalledTimes(1)
    expect(onPreset).toHaveBeenCalledWith('doorway')
  })

  it('disables the doorway button when no doorway is available', () => {
    render(
      <SceneNavToolbar
        mode="orbit"
        onModeChange={vi.fn()}
        onReset={vi.fn()}
        colorTemperatureK={6500}
        onColorTemperatureChange={vi.fn()}
        onPreset={vi.fn()}
        canDoorway={false}
      />,
    )

    expect(screen.getByRole('button', { name: 'Doorway' })).toBeDisabled()
  })

  it('enables the doorway button when a doorway is available', () => {
    render(
      <SceneNavToolbar
        mode="orbit"
        onModeChange={vi.fn()}
        onReset={vi.fn()}
        colorTemperatureK={6500}
        onColorTemperatureChange={vi.fn()}
        onPreset={vi.fn()}
        canDoorway
      />,
    )

    expect(screen.getByRole('button', { name: 'Doorway' })).toBeEnabled()
  })
})

describe('SceneNavToolbar styling hooks', () => {
  it('groups the orbit and walk modes into a labeled segmented toggle', () => {
    render(
      <SceneNavToolbar
        mode="orbit"
        onModeChange={vi.fn()}
        onReset={vi.fn()}
        colorTemperatureK={6500}
        onColorTemperatureChange={vi.fn()}
      />,
    )

    const modes = screen.getByRole('group', { name: /camera mode/i })
    expect(modes).toHaveClass('scene-nav-toolbar__modes')
    expect(modes).toContainElement(screen.getByRole('button', { name: 'Orbit' }))
    expect(modes).toContainElement(screen.getByRole('button', { name: 'Walk' }))
  })

  it('styles the mode buttons as segments of the toggle', () => {
    render(
      <SceneNavToolbar
        mode="orbit"
        onModeChange={vi.fn()}
        onReset={vi.fn()}
        colorTemperatureK={6500}
        onColorTemperatureChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Orbit' })).toHaveClass('scene-nav-toolbar__mode')
    expect(screen.getByRole('button', { name: 'Walk' })).toHaveClass('scene-nav-toolbar__mode')
  })

  it('styles the reset control and the preset buttons as toolbar buttons', () => {
    render(
      <SceneNavToolbar
        mode="orbit"
        onModeChange={vi.fn()}
        onReset={vi.fn()}
        colorTemperatureK={6500}
        onColorTemperatureChange={vi.fn()}
        onPreset={vi.fn()}
        canDoorway
      />,
    )

    expect(screen.getByRole('button', { name: 'Reset view' })).toHaveClass('scene-nav-toolbar__btn')
    expect(screen.getByRole('button', { name: 'Top down' })).toHaveClass('scene-nav-toolbar__btn')
    expect(screen.getByRole('button', { name: 'Doorway' })).toHaveClass('scene-nav-toolbar__btn')
  })
})
