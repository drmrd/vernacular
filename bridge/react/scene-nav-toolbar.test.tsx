import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SceneNavToolbar } from './scene-nav-toolbar'

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
