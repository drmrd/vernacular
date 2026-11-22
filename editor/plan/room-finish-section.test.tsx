import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PerceivedColorContext } from '../../bridge/react/perceived-color-context'
import { createPerceivedColorStore } from '../../bridge/perceived-color/perceived-color-store'
import {
  SurfaceSelectionProvider,
  createSurfaceSelectionStore,
  type SurfaceSelectionStore,
} from '../../bridge'
import { colorFromHex } from '../../core'
import { RoomFinishSection } from './room-finish-section'

afterEach(cleanup)

interface SectionOptions {
  store?: SurfaceSelectionStore
  roomsOnFloor?: number
}

function renderSection({
  store = createSurfaceSelectionStore(),
  roomsOnFloor,
}: SectionOptions = {}) {
  return render(
    <SurfaceSelectionProvider store={store}>
      <RoomFinishSection
        floorId="g"
        treatmentFor={() => undefined}
        recent={[]}
        dispatch={vi.fn()}
        roomsOnFloor={roomsOnFloor}
      />
    </SurfaceSelectionProvider>,
  )
}

describe('RoomFinishSection', () => {
  it('renders Floor and Ceiling chips for the room floor surfaces', () => {
    renderSection()
    expect(screen.getByRole('button', { name: 'Floor' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ceiling' })).toBeInTheDocument()
  })

  it('labels the section as covering every room on the floor, not just the selected one', () => {
    renderSection()
    const label = screen.getByText('Finish (all rooms on this floor)')
    expect(label).toHaveClass('ds-section-label')
    expect(label).not.toHaveClass('finish-section__label')
  })

  it('always shows a hint that floor and ceiling finishes cover every room on the floor', () => {
    renderSection()
    const hint = screen.getByText(
      'Floor and ceiling finishes cover every room on this floor, not just the selected one.',
    )
    expect(hint).toHaveClass('finish-section__hint')
  })

  it('routes the surface chips through the design-system Segmented option vocabulary', () => {
    renderSection()

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
    renderSection()

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
        <SurfaceSelectionProvider store={createSurfaceSelectionStore()}>
          <RoomFinishSection
            floorId="g"
            treatmentFor={() => undefined}
            recent={[]}
            dispatch={vi.fn()}
          />
        </SurfaceSelectionProvider>
      </PerceivedColorContext.Provider>,
    )

    expect(screen.getByText(sample.srgbHex)).toHaveAttribute('data-perceived', sample.srgbHex)
  })

  it('renders no perceived-color readout when there is no PerceivedColorContext provider', () => {
    // The tests above and every committed Storybook story for this section
    // render without a PerceivedColorContext.Provider. If mounting the
    // readout changed what is rendered in that unwrapped case, every one of
    // those story baselines would move the moment the readout landed.
    renderSection()

    expect(document.querySelector('[data-perceived]')).toBeNull()
  })
})

describe('RoomFinishSection when the floor holds more than one room', () => {
  it('hides the surface switch and paint controls and shows a note that painting here would repaint every room', () => {
    renderSection({ roomsOnFloor: 2 })

    expect(screen.queryByRole('group', { name: 'Surface' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Floor' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ceiling' })).toBeNull()

    const note = screen.getByText(
      'This floor holds 2 rooms, so a finish here would repaint every one of them. Per-room floor and ceiling finishes are not available yet.',
    )
    expect(note).toHaveClass('finish-section__note')
  })

  it('still shows the shared-scope hint even when the note replaces the paint controls', () => {
    renderSection({ roomsOnFloor: 2 })

    expect(
      screen.getByText(
        'Floor and ceiling finishes cover every room on this floor, not just the selected one.',
      ),
    ).toBeInTheDocument()
  })
})

describe('RoomFinishSection follows the active surface', () => {
  it('shows Ceiling as chosen when the active surface is the ceiling of its floor', () => {
    const store = createSurfaceSelectionStore()
    store.select({ kind: 'ceiling', floorId: 'g' })

    renderSection({ store })

    expect(screen.getByRole('button', { name: 'Ceiling' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Floor' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('renders the perceived-color readout for the ceiling when the ceiling is active', () => {
    const store = createSurfaceSelectionStore()
    store.select({ kind: 'ceiling', floorId: 'g' })
    const perceivedColorStore = createPerceivedColorStore()
    const sample = colorFromHex('#c3b2a1')
    perceivedColorStore.resolveSample({
      surface: { kind: 'ceiling', floorId: 'g' },
      color: sample,
    })

    render(
      <PerceivedColorContext.Provider value={perceivedColorStore}>
        <SurfaceSelectionProvider store={store}>
          <RoomFinishSection
            floorId="g"
            treatmentFor={() => undefined}
            recent={[]}
            dispatch={vi.fn()}
          />
        </SurfaceSelectionProvider>
      </PerceivedColorContext.Provider>,
    )

    expect(screen.getByText(sample.srgbHex)).toHaveAttribute('data-perceived', sample.srgbHex)
  })

  it('shows Floor again when the active surface changes from the ceiling to another surface', () => {
    const store = createSurfaceSelectionStore()
    store.select({ kind: 'ceiling', floorId: 'g' })
    renderSection({ store })
    expect(screen.getByRole('button', { name: 'Ceiling' })).toHaveAttribute('aria-pressed', 'true')

    act(() => store.select({ kind: 'wall-face', wallId: 'w1', side: 'left' }))

    expect(screen.getByRole('button', { name: 'Floor' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Ceiling' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('makes the ceiling of its floor the active surface when Ceiling is chosen', async () => {
    const user = userEvent.setup()
    const store = createSurfaceSelectionStore()
    renderSection({ store })

    await user.click(screen.getByRole('button', { name: 'Ceiling' }))

    expect(store.getActiveSurface()).toEqual({ kind: 'ceiling', floorId: 'g' })
  })

  it('makes the floor of its floor the active surface when Floor is chosen', async () => {
    const user = userEvent.setup()
    const store = createSurfaceSelectionStore()
    store.select({ kind: 'ceiling', floorId: 'g' })
    renderSection({ store })

    await user.click(screen.getByRole('button', { name: 'Floor' }))

    expect(store.getActiveSurface()).toEqual({ kind: 'floor', floorId: 'g' })
  })
})
