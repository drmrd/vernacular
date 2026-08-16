import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PerceivedColorContext } from '../../bridge/react/perceived-color-context'
import { createPerceivedColorStore } from '../../bridge/perceived-color/perceived-color-store'
import { colorFromHex } from '../../core'
import { RoomFinishSection } from './room-finish-section'

afterEach(cleanup)

describe('RoomFinishSection', () => {
  it('renders Floor and Ceiling chips for the room floor surfaces', () => {
    render(
      <RoomFinishSection
        floorId="g"
        treatmentFor={() => undefined}
        recent={[]}
        dispatch={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Floor' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ceiling' })).toBeInTheDocument()
  })

  it('renders the Finish label through the SectionLabel primitive', () => {
    render(
      <RoomFinishSection
        floorId="g"
        treatmentFor={() => undefined}
        recent={[]}
        dispatch={vi.fn()}
      />,
    )
    const label = screen.getByText(/finish/i)
    expect(label).toHaveClass('ds-section-label')
    expect(label).not.toHaveClass('finish-section__label')
  })

  it('routes the surface chips through the design-system Segmented option vocabulary', () => {
    render(
      <RoomFinishSection
        floorId="g"
        treatmentFor={() => undefined}
        recent={[]}
        dispatch={vi.fn()}
      />,
    )

    expect(screen.getByRole('group', { name: 'Room surface' })).toBeInTheDocument()

    const floor = screen.getByRole('button', { name: 'Floor' })
    const ceiling = screen.getByRole('button', { name: 'Ceiling' })

    for (const chip of [floor, ceiling]) {
      expect(chip).toHaveClass('ds-segmented__option')
      expect(chip).not.toHaveClass('finish-section__chip')
    }

    expect(floor).toHaveClass('is-active')
    expect(floor).toHaveAttribute('aria-pressed', 'true')
    expect(ceiling).not.toHaveClass('is-active')
  })

  it('switches the active surface when Ceiling is clicked', async () => {
    const user = userEvent.setup()
    render(
      <RoomFinishSection
        floorId="g"
        treatmentFor={() => undefined}
        recent={[]}
        dispatch={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Ceiling' }))

    const ceiling = screen.getByRole('button', { name: 'Ceiling' })
    expect(ceiling).toHaveClass('is-active')
    expect(ceiling).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Floor' })).not.toHaveClass('is-active')
  })
})

describe('RoomFinishSection perceived-color readout', () => {
  it('renders the perceived-color readout for the currently shown floor surface', () => {
    const perceivedColorStore = createPerceivedColorStore()
    const sample = colorFromHex('#a1b2c3')
    perceivedColorStore.resolveSample({
      surface: { kind: 'floor', floorId: 'g' },
      color: sample,
    })

    render(
      <PerceivedColorContext.Provider value={perceivedColorStore}>
        <RoomFinishSection
          floorId="g"
          treatmentFor={() => undefined}
          recent={[]}
          dispatch={vi.fn()}
        />
      </PerceivedColorContext.Provider>,
    )

    expect(screen.getByText(sample.srgbHex)).toHaveAttribute('data-perceived', sample.srgbHex)
  })

  it('renders no perceived-color readout when there is no PerceivedColorContext provider', () => {
    // The tests above and every committed Storybook story for this section
    // render without a PerceivedColorContext.Provider. If mounting the
    // readout changed what is rendered in that unwrapped case, every one of
    // those story baselines would move the moment the readout landed.
    render(
      <RoomFinishSection
        floorId="g"
        treatmentFor={() => undefined}
        recent={[]}
        dispatch={vi.fn()}
      />,
    )

    expect(document.querySelector('[data-perceived]')).toBeNull()
  })
})
