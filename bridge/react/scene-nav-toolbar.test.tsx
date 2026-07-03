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

const baseProps = {
  mode: 'orbit' as const,
  onModeChange: vi.fn(),
  onReset: vi.fn(),
  colorTemperatureK: 6500,
  onColorTemperatureChange: vi.fn(),
}

describe('SceneNavToolbar', () => {
  it('renders orbit, walk, and reset controls inside a navigation toolbar', () => {
    render(<SceneNavToolbar {...baseProps} />)

    const toolbar = screen.getByRole('toolbar', { name: /navigation/i })
    expect(toolbar).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Orbit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Walk' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset view' })).toBeInTheDocument()
  })

  it('marks the active mode button as pressed and the inactive one as not pressed', () => {
    render(<SceneNavToolbar {...baseProps} mode="walk" />)

    expect(screen.getByRole('button', { name: 'Walk' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Orbit' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('reports a mode change when an inactive mode button is clicked', async () => {
    const onModeChange = vi.fn()
    render(<SceneNavToolbar {...baseProps} onModeChange={onModeChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Walk' }))

    expect(onModeChange).toHaveBeenCalledTimes(1)
    expect(onModeChange).toHaveBeenCalledWith('walk')
  })

  it('reports a reset when the reset control is clicked', async () => {
    const onReset = vi.fn()
    render(<SceneNavToolbar {...baseProps} onReset={onReset} />)

    await userEvent.click(screen.getByRole('button', { name: 'Reset view' }))

    expect(onReset).toHaveBeenCalledTimes(1)
  })

  it('renders a color-temperature slider spanning the supported kelvin band', () => {
    render(<SceneNavToolbar {...baseProps} />)

    const slider = screen.getByRole('slider', { name: /color temperature/i })
    expect(slider).toHaveAttribute('min', '2700')
    expect(slider).toHaveAttribute('max', '6500')
    expect(slider).toHaveValue('6500')
    expect(slider).toHaveAttribute('aria-valuetext', '6500 kelvin')
  })

  it('reports a color-temperature change when the slider moves', () => {
    const onColorTemperatureChange = vi.fn()
    render(<SceneNavToolbar {...baseProps} onColorTemperatureChange={onColorTemperatureChange} />)

    fireEvent.change(screen.getByRole('slider', { name: /color temperature/i }), {
      target: { value: '3000' },
    })

    expect(onColorTemperatureChange).toHaveBeenCalledWith(3000)
  })
})

describe('SceneNavToolbar view scope', () => {
  it('renders a view-scope toggle with this-floor and whole-building options', () => {
    render(<SceneNavToolbar {...baseProps} />)

    const group = screen.getByRole('group', { name: /view scope/i })
    expect(group).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'This floor' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Whole building' })).toBeInTheDocument()
  })

  it('defaults to the active-floor scope and marks it pressed', () => {
    render(<SceneNavToolbar {...baseProps} />)

    expect(screen.getByRole('button', { name: 'This floor' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Whole building' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('marks the whole-building scope pressed when it is active', () => {
    render(<SceneNavToolbar {...baseProps} scope="building" />)

    expect(screen.getByRole('button', { name: 'Whole building' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'This floor' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('reports a scope change when an inactive scope button is clicked', async () => {
    const onScopeChange = vi.fn()
    render(<SceneNavToolbar {...baseProps} onScopeChange={onScopeChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Whole building' }))

    expect(onScopeChange).toHaveBeenCalledTimes(1)
    expect(onScopeChange).toHaveBeenCalledWith('building')
  })
})

describe('SceneNavToolbar underground levels', () => {
  it('renders an underground-levels toggle pressed when underground levels are shown', () => {
    render(<SceneNavToolbar {...baseProps} scope="building" showUnderground />)

    expect(screen.getByRole('button', { name: /underground levels/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('marks the underground toggle unpressed when underground levels are hidden', () => {
    render(<SceneNavToolbar {...baseProps} scope="building" showUnderground={false} />)

    expect(screen.getByRole('button', { name: /underground levels/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('reports a toggle when the underground control is clicked in building scope', async () => {
    const onToggleUnderground = vi.fn()
    render(
      <SceneNavToolbar {...baseProps} scope="building" onToggleUnderground={onToggleUnderground} />,
    )

    await userEvent.click(screen.getByRole('button', { name: /underground levels/i }))

    expect(onToggleUnderground).toHaveBeenCalledTimes(1)
  })

  it('disables the underground toggle in this-floor scope where it does not apply', () => {
    render(<SceneNavToolbar {...baseProps} scope="floor" />)

    expect(screen.getByRole('button', { name: /underground levels/i })).toBeDisabled()
  })

  it('enables the underground toggle in whole-building scope', () => {
    render(<SceneNavToolbar {...baseProps} scope="building" />)

    expect(screen.getByRole('button', { name: /underground levels/i })).toBeEnabled()
  })
})

describe('SceneNavToolbar click-select toggle', () => {
  it('renders a select-toggle button that is off by default and toggles on click', async () => {
    const onToggleSelection = vi.fn()
    const { rerender } = render(
      <SceneNavToolbar
        {...baseProps}
        selectionEnabled={false}
        onToggleSelection={onToggleSelection}
      />,
    )

    const toggle = screen.getByRole('button', { name: /select/i })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(toggle)
    expect(onToggleSelection).toHaveBeenCalledTimes(1)

    rerender(
      <SceneNavToolbar {...baseProps} selectionEnabled onToggleSelection={onToggleSelection} />,
    )

    expect(screen.getByRole('button', { name: /select/i })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('SceneNavToolbar color-temperature readout', () => {
  it('shows the live Kelvin value and warm/cool captions while keeping the slider accessible name', () => {
    render(<SceneNavToolbar {...baseProps} colorTemperatureK={MAX_COLOR_TEMPERATURE_K} />)

    expect(screen.getByText(formatColorTemperature(MAX_COLOR_TEMPERATURE_K))).toBeInTheDocument()
    expect(screen.getByText('Warm')).toBeInTheDocument()
    expect(screen.getByText('Cool')).toBeInTheDocument()

    const slider = screen.getByRole('slider', { name: /color temperature/i })
    expect(slider).toHaveAttribute('aria-valuetext', '6500 kelvin')
  })

  it('reflects the current prop value in the readout rather than a hardcoded number', () => {
    render(<SceneNavToolbar {...baseProps} colorTemperatureK={MIN_COLOR_TEMPERATURE_K} />)

    expect(screen.getByText(formatColorTemperature(MIN_COLOR_TEMPERATURE_K))).toBeInTheDocument()
    expect(
      screen.queryByText(formatColorTemperature(MAX_COLOR_TEMPERATURE_K)),
    ).not.toBeInTheDocument()
  })
})

describe('SceneNavToolbar camera presets', () => {
  it('renders a camera-preset group with the six named view buttons', () => {
    render(<SceneNavToolbar {...baseProps} onPreset={vi.fn()} canDoorway />)

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
    render(<SceneNavToolbar {...baseProps} onPreset={onPreset} canDoorway />)

    await userEvent.click(screen.getByRole('button', { name: label }))

    expect(onPreset).toHaveBeenCalledTimes(1)
    expect(onPreset).toHaveBeenCalledWith(tag)
  })

  it('reports the doorway preset when the doorway button is enabled and clicked', async () => {
    const onPreset = vi.fn()
    render(<SceneNavToolbar {...baseProps} onPreset={onPreset} canDoorway />)

    await userEvent.click(screen.getByRole('button', { name: 'Doorway' }))

    expect(onPreset).toHaveBeenCalledTimes(1)
    expect(onPreset).toHaveBeenCalledWith('doorway')
  })

  it('disables the doorway button when no doorway is available', () => {
    render(<SceneNavToolbar {...baseProps} onPreset={vi.fn()} canDoorway={false} />)

    expect(screen.getByRole('button', { name: 'Doorway' })).toBeDisabled()
  })

  it('enables the doorway button when a doorway is available', () => {
    render(<SceneNavToolbar {...baseProps} onPreset={vi.fn()} canDoorway />)

    expect(screen.getByRole('button', { name: 'Doorway' })).toBeEnabled()
  })
})

describe('SceneNavToolbar styling hooks', () => {
  it('groups the orbit and walk modes into a labeled segmented toggle', () => {
    render(<SceneNavToolbar {...baseProps} />)

    const modes = screen.getByRole('group', { name: /camera mode/i })
    expect(modes).toHaveClass('scene-nav-toolbar__modes')
    expect(modes).toContainElement(screen.getByRole('button', { name: 'Orbit' }))
    expect(modes).toContainElement(screen.getByRole('button', { name: 'Walk' }))
  })

  it('styles the mode buttons as segments of the toggle', () => {
    render(<SceneNavToolbar {...baseProps} />)

    expect(screen.getByRole('button', { name: 'Orbit' })).toHaveClass('scene-nav-toolbar__mode')
    expect(screen.getByRole('button', { name: 'Walk' })).toHaveClass('scene-nav-toolbar__mode')
  })

  it('styles the reset control and the preset buttons as toolbar buttons', () => {
    render(<SceneNavToolbar {...baseProps} onPreset={vi.fn()} canDoorway />)

    expect(screen.getByRole('button', { name: 'Reset view' })).toHaveClass('scene-nav-toolbar__btn')
    expect(screen.getByRole('button', { name: 'Top down' })).toHaveClass('scene-nav-toolbar__btn')
    expect(screen.getByRole('button', { name: 'Doorway' })).toHaveClass('scene-nav-toolbar__btn')
  })

  it('groups the camera-mode toggle and the reset action into a primary cluster', () => {
    const { container } = render(
      <SceneNavToolbar {...baseProps} selectionEnabled={false} onToggleSelection={vi.fn()} />,
    )

    const primary = container.querySelector('.scene-nav-toolbar__primary')
    expect(primary).not.toBeNull()
    expect(primary).toContainElement(screen.getByRole('group', { name: /camera mode/i }))
    expect(primary).toContainElement(screen.getByRole('button', { name: 'Reset view' }))
    expect(primary).toContainElement(screen.getByRole('button', { name: /select/i }))
  })

  it('marks the camera presets as the secondary tier while keeping the six named buttons', () => {
    render(<SceneNavToolbar {...baseProps} onPreset={vi.fn()} canDoorway />)

    const presets = screen.getByRole('group', { name: /camera presets/i })
    expect(presets).toHaveClass('scene-nav-toolbar__presets')
    expect(presets).toHaveClass('scene-nav-toolbar__secondary')
    expect(presets).toContainElement(screen.getByRole('button', { name: 'Top down' }))
    expect(presets).toContainElement(screen.getByRole('button', { name: 'North' }))
    expect(presets).toContainElement(screen.getByRole('button', { name: 'South' }))
    expect(presets).toContainElement(screen.getByRole('button', { name: 'East' }))
    expect(presets).toContainElement(screen.getByRole('button', { name: 'West' }))
    expect(presets).toContainElement(screen.getByRole('button', { name: 'Doorway' }))
  })

  it('places the color-temperature control in its own environment cluster while keeping the slider accessible', () => {
    const { container } = render(<SceneNavToolbar {...baseProps} />)

    const environment = container.querySelector('.scene-nav-toolbar__environment')
    expect(environment).not.toBeNull()

    const slider = screen.getByRole('slider', { name: /color temperature/i })
    expect(environment).toContainElement(slider)
    expect(slider).toHaveAttribute('aria-valuetext', '6500 kelvin')
    expect(environment).toContainElement(
      screen.getByText(formatColorTemperature(baseProps.colorTemperatureK)),
    )
  })
})

describe('SceneNavToolbar reveal-interior toggle', () => {
  it('renders a reveal-interior toggle pressed by default so near walls fade while orbiting', () => {
    render(<SceneNavToolbar {...baseProps} />)

    expect(screen.getByRole('button', { name: 'Reveal interior' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('marks the reveal-interior toggle unpressed when the fade is turned off', () => {
    render(<SceneNavToolbar {...baseProps} revealInterior={false} />)

    expect(screen.getByRole('button', { name: 'Reveal interior' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('reports a toggle when clicked without flipping its own pressed state', async () => {
    const onToggleRevealInterior = vi.fn()
    render(
      <SceneNavToolbar
        {...baseProps}
        revealInterior
        onToggleRevealInterior={onToggleRevealInterior}
      />,
    )

    const toggle = screen.getByRole('button', { name: 'Reveal interior' })
    await userEvent.click(toggle)

    expect(onToggleRevealInterior).toHaveBeenCalledTimes(1)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
  })

  it('places the reveal-interior toggle in the primary cluster and styles it as a toolbar button', () => {
    const { container } = render(
      <SceneNavToolbar {...baseProps} onToggleRevealInterior={vi.fn()} />,
    )

    const toggle = screen.getByRole('button', { name: 'Reveal interior' })
    expect(toggle).toHaveClass('scene-nav-toolbar__btn')

    const primary = container.querySelector('.scene-nav-toolbar__primary')
    expect(primary).not.toBeNull()
    expect(primary).toContainElement(toggle)
  })
})

describe('SceneNavToolbar surface-edges toggle', () => {
  it('renders a surface-edges toggle in a display-options group, off by default', () => {
    render(<SceneNavToolbar {...baseProps} />)

    const toggle = screen.getByRole('button', { name: 'Surface edges' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('group', { name: /display options/i })).toContainElement(toggle)
  })

  it('marks the surface-edges toggle pressed when the overlay is on', () => {
    render(<SceneNavToolbar {...baseProps} edgeOverlay />)

    expect(screen.getByRole('button', { name: 'Surface edges' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('reports a toggle when clicked without flipping its own pressed state', async () => {
    const onToggleEdgeOverlay = vi.fn()
    render(<SceneNavToolbar {...baseProps} onToggleEdgeOverlay={onToggleEdgeOverlay} />)

    const toggle = screen.getByRole('button', { name: 'Surface edges' })
    await userEvent.click(toggle)

    expect(onToggleEdgeOverlay).toHaveBeenCalledTimes(1)
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('SceneNavToolbar realistic-lighting toggle', () => {
  it('renders a realistic-lighting toggle in the display-options group, off by default', () => {
    render(<SceneNavToolbar {...baseProps} />)

    const toggle = screen.getByRole('button', { name: /realistic lighting/i })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('group', { name: /display options/i })).toContainElement(toggle)
  })

  it('marks the realistic-lighting toggle pressed when realistic mode is active', () => {
    render(<SceneNavToolbar {...baseProps} realisticLighting />)

    expect(screen.getByRole('button', { name: /realistic lighting/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('reports a toggle when clicked without flipping its own pressed state', async () => {
    const onToggleRealisticLighting = vi.fn()
    render(<SceneNavToolbar {...baseProps} onToggleRealisticLighting={onToggleRealisticLighting} />)

    const toggle = screen.getByRole('button', { name: /realistic lighting/i })
    await userEvent.click(toggle)

    expect(onToggleRealisticLighting).toHaveBeenCalledTimes(1)
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('SceneNavToolbar observation datetime', () => {
  it('shows the observation datetime and reports changes parsed to an instant', () => {
    const onObservationChange = vi.fn()
    render(
      <SceneNavToolbar
        {...baseProps}
        observationInstant={{ date: '2026-06-21', minutesSinceMidnight: 720 }}
        onObservationChange={onObservationChange}
      />,
    )

    const input = screen.getByLabelText(/observation date and time/i)
    expect(input).toHaveValue('2026-06-21T12:00')

    fireEvent.change(input, { target: { value: '2026-12-04T16:00' } })
    expect(onObservationChange).toHaveBeenCalledWith({
      date: '2026-12-04',
      minutesSinceMidnight: 960,
    })
  })
})
