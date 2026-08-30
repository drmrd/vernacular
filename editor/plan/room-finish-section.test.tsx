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

  it('labels the section as covering every room on the floor, not just the selected one', () => {
    render(
      <RoomFinishSection
        floorId="g"
        treatmentFor={() => undefined}
        recent={[]}
        dispatch={vi.fn()}
      />,
    )
    const label = screen.getByText('Finish (all rooms on this floor)')
    expect(label).toHaveClass('ds-section-label')
    expect(label).not.toHaveClass('finish-section__label')
  })

  it('always shows a hint that floor and ceiling finishes cover every room on the floor', () => {
    render(
      <RoomFinishSection
        floorId="g"
        treatmentFor={() => undefined}
        recent={[]}
        dispatch={vi.fn()}
      />,
    )
    const hint = screen.getByText(
      'Floor and ceiling finishes cover every room on this floor, not just the selected one.',
    )
    expect(hint).toHaveClass('finish-section__hint')
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

    expect(screen.getByRole('group', { name: 'Surface' })).toBeInTheDocument()

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

describe('RoomFinishSection when the floor holds more than one room', () => {
  it('hides the surface switch and paint controls and shows a note that painting here would repaint every room', () => {
    render(
      <RoomFinishSection
        floorId="g"
        treatmentFor={() => undefined}
        recent={[]}
        dispatch={vi.fn()}
        roomsOnFloor={2}
      />,
    )

    expect(screen.queryByRole('group', { name: 'Surface' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Floor' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ceiling' })).toBeNull()

    const note = screen.getByText(
      'This floor holds 2 rooms, so a finish here would repaint every one of them. Per-room floor and ceiling finishes are not available yet.',
    )
    expect(note).toHaveClass('finish-section__note')
  })

  it('still shows the shared-scope hint even when the note replaces the paint controls', () => {
    render(
      <RoomFinishSection
        floorId="g"
        treatmentFor={() => undefined}
        recent={[]}
        dispatch={vi.fn()}
        roomsOnFloor={2}
      />,
    )

    expect(
      screen.getByText(
        'Floor and ceiling finishes cover every room on this floor, not just the selected one.',
      ),
    ).toBeInTheDocument()
  })
})
