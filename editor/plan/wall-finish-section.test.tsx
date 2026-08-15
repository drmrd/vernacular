import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import type { ReactElement } from 'react'
import userEvent from '@testing-library/user-event'
import { SurfaceSelectionContext } from '../../bridge/react/surface-selection-context'
import {
  createSurfaceSelectionStore,
  type SurfaceSelectionStore,
} from '../../bridge/selection/surface-selection-store'
import { PerceivedColorContext } from '../../bridge/react/perceived-color-context'
import {
  createPerceivedColorStore,
  type PerceivedColorStore,
} from '../../bridge/perceived-color/perceived-color-store'
import { colorFromHex } from '../../core'
import { WallFinishSection } from './wall-finish-section'

afterEach(cleanup)

function renderWithSurface(
  ui: ReactElement,
  store: SurfaceSelectionStore = createSurfaceSelectionStore(),
) {
  return {
    store,
    ...render(
      <SurfaceSelectionContext.Provider value={store}>{ui}</SurfaceSelectionContext.Provider>,
    ),
  }
}

describe('WallFinishSection chip rendering and structure', () => {
  it('renders Face A and Face B chips for the two wall sides', () => {
    renderWithSurface(
      <WallFinishSection
        wallId="w1"
        treatmentFor={() => undefined}
        recent={[]}
        dispatch={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'A' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'B' })).toBeInTheDocument()
  })

  it('renders the Finish label through the SectionLabel primitive', () => {
    renderWithSurface(
      <WallFinishSection
        wallId="w1"
        treatmentFor={() => undefined}
        recent={[]}
        dispatch={vi.fn()}
      />,
    )
    const label = screen.getByText(/finish/i)
    expect(label).toHaveClass('ds-section-label')
    expect(label).not.toHaveClass('finish-section__label')
  })

  it('marks Face A active by default', () => {
    renderWithSurface(
      <WallFinishSection
        wallId="w1"
        treatmentFor={() => undefined}
        recent={[]}
        dispatch={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'A' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'B' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('routes the face chips through the design-system Segmented option vocabulary', () => {
    renderWithSurface(
      <WallFinishSection
        wallId="w1"
        treatmentFor={() => undefined}
        recent={[]}
        dispatch={vi.fn()}
      />,
    )

    expect(screen.getByRole('group', { name: 'Wall face' })).toBeInTheDocument()

    const faceA = screen.getByRole('button', { name: 'A' })
    const faceB = screen.getByRole('button', { name: 'B' })

    for (const chip of [faceA, faceB]) {
      expect(chip).toHaveClass('ds-segmented__option')
      expect(chip).not.toHaveClass('finish-section__chip')
    }

    expect(faceA).toHaveClass('is-active')
    expect(faceA).toHaveAttribute('aria-pressed', 'true')
    expect(faceB).not.toHaveClass('is-active')
  })

  it('explains that A and B are the two paintable wall faces', () => {
    renderWithSurface(
      <WallFinishSection
        wallId="w1"
        treatmentFor={() => undefined}
        recent={[]}
        dispatch={vi.fn()}
      />,
    )

    expect(screen.getByText(/two paintable faces/i)).toBeInTheDocument()
  })

  it('switches the active face when Face B is clicked', async () => {
    const user = userEvent.setup()
    renderWithSurface(
      <WallFinishSection
        wallId="w1"
        treatmentFor={() => undefined}
        recent={[]}
        dispatch={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'B' }))

    const faceB = screen.getByRole('button', { name: 'B' })
    expect(faceB).toHaveClass('is-active')
    expect(faceB).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'A' })).not.toHaveClass('is-active')
  })
})

describe('WallFinishSection selection-driven plan highlight', () => {
  it('highlights the wall A face on the plan as soon as the section mounts', () => {
    const { store } = renderWithSurface(
      <WallFinishSection
        wallId="w1"
        treatmentFor={() => undefined}
        recent={[]}
        dispatch={vi.fn()}
      />,
    )

    expect(store.getHighlightedSurface()).toEqual({
      kind: 'wall-face',
      wallId: 'w1',
      side: 'left',
    })
  })

  it('moves the plan highlight to the wall B face when Face B is clicked', async () => {
    const user = userEvent.setup()
    const { store } = renderWithSurface(
      <WallFinishSection
        wallId="w1"
        treatmentFor={() => undefined}
        recent={[]}
        dispatch={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'B' }))

    expect(store.getHighlightedSurface()).toEqual({
      kind: 'wall-face',
      wallId: 'w1',
      side: 'right',
    })
  })

  it('returns the plan highlight to the wall A face when Face A is clicked again', async () => {
    const user = userEvent.setup()
    const { store } = renderWithSurface(
      <WallFinishSection
        wallId="w1"
        treatmentFor={() => undefined}
        recent={[]}
        dispatch={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'B' }))
    await user.click(screen.getByRole('button', { name: 'A' }))

    expect(store.getHighlightedSurface()).toEqual({
      kind: 'wall-face',
      wallId: 'w1',
      side: 'left',
    })
  })
})

describe('WallFinishSection hover preview of the plan highlight', () => {
  it('previews the wall B face on the plan while the B chip is hovered without changing the selection', async () => {
    const user = userEvent.setup()
    const { store } = renderWithSurface(
      <WallFinishSection
        wallId="w1"
        treatmentFor={() => undefined}
        recent={[]}
        dispatch={vi.fn()}
      />,
    )

    await user.hover(screen.getByRole('button', { name: 'B' }))

    expect(store.getHighlightedSurface()).toEqual({
      kind: 'wall-face',
      wallId: 'w1',
      side: 'right',
    })
    expect(screen.getByRole('button', { name: 'A' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('reverts the plan highlight to the selected wall face when the pointer leaves the chips', async () => {
    const user = userEvent.setup()
    const { store } = renderWithSurface(
      <WallFinishSection
        wallId="w1"
        treatmentFor={() => undefined}
        recent={[]}
        dispatch={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'B' }))
    await user.hover(screen.getByRole('button', { name: 'A' }))
    fireEvent.mouseLeave(screen.getByRole('group', { name: 'Wall face' }))

    expect(store.getHighlightedSurface()).toEqual({
      kind: 'wall-face',
      wallId: 'w1',
      side: 'right',
    })
  })

  it('clears the plan highlight when the section unmounts', () => {
    const { store, unmount } = renderWithSurface(
      <WallFinishSection
        wallId="w1"
        treatmentFor={() => undefined}
        recent={[]}
        dispatch={vi.fn()}
      />,
    )

    unmount()

    expect(store.getHighlightedSurface()).toBeNull()
  })
})

describe('WallFinishSection reflection of a plan-driven face highlight', () => {
  it('previews the B chip when the plan highlights this wall B face while A is selected', () => {
    const store = createSurfaceSelectionStore()
    renderWithSurface(
      <WallFinishSection
        wallId="w1"
        treatmentFor={() => undefined}
        recent={[]}
        dispatch={vi.fn()}
      />,
      store,
    )

    act(() => store.highlight({ kind: 'wall-face', wallId: 'w1', side: 'right' }))

    const faceB = screen.getByRole('button', { name: 'B' })
    expect(faceB).toHaveClass('is-preview')
    // The reflection is preview-only: the selection stays on Face A.
    expect(faceB).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'A' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('does not preview a chip when the plan highlights the already-selected face', () => {
    const store = createSurfaceSelectionStore()
    renderWithSurface(
      <WallFinishSection
        wallId="w1"
        treatmentFor={() => undefined}
        recent={[]}
        dispatch={vi.fn()}
      />,
      store,
    )

    act(() => store.highlight({ kind: 'wall-face', wallId: 'w1', side: 'left' }))

    expect(screen.getByRole('button', { name: 'A' })).not.toHaveClass('is-preview')
    expect(screen.getByRole('button', { name: 'B' })).not.toHaveClass('is-preview')
  })

  it('does not preview a chip when a different wall is highlighted on the plan', () => {
    const store = createSurfaceSelectionStore()
    renderWithSurface(
      <WallFinishSection
        wallId="w1"
        treatmentFor={() => undefined}
        recent={[]}
        dispatch={vi.fn()}
      />,
      store,
    )

    act(() => store.highlight({ kind: 'wall-face', wallId: 'w2', side: 'right' }))

    expect(screen.getByRole('button', { name: 'A' })).not.toHaveClass('is-preview')
    expect(screen.getByRole('button', { name: 'B' })).not.toHaveClass('is-preview')
  })
})

describe('WallFinishSection perceived-color readout', () => {
  const sample = colorFromHex('#a1b2c3')
  const props = { wallId: 'w1', treatmentFor: () => undefined, recent: [], dispatch: vi.fn() }

  function storeWithLeftFaceSample(): PerceivedColorStore {
    const store = createPerceivedColorStore()
    store.resolveSample({
      surface: { kind: 'wall-face', wallId: 'w1', side: 'left' },
      color: sample,
    })
    return store
  }

  function renderWithPerceivedColor(store: PerceivedColorStore) {
    return renderWithSurface(
      <PerceivedColorContext.Provider value={store}>
        <WallFinishSection {...props} />
      </PerceivedColorContext.Provider>,
    )
  }

  it('renders the perceived-color readout for the currently shown wall face', () => {
    renderWithPerceivedColor(storeWithLeftFaceSample())

    expect(screen.getByText(sample.srgbHex)).toHaveAttribute('data-perceived', sample.srgbHex)
  })

  it('follows the selected face, hiding a readout resolved for the face no longer shown', async () => {
    const user = userEvent.setup()
    renderWithPerceivedColor(storeWithLeftFaceSample())
    // Confirms the readout is showing for the left face before the switch,
    // so the disappearance asserted below is a genuine change.
    expect(screen.getByText(sample.srgbHex)).toHaveAttribute('data-perceived', sample.srgbHex)

    await user.click(screen.getByRole('button', { name: 'B' }))

    // The sample was resolved for the left ("A") face, no longer shown once
    // "B" is selected. A readout tied to a fixed surface would still show it.
    expect(screen.queryByText(sample.srgbHex)).toBeNull()
  })

  it('renders no perceived-color readout when there is no PerceivedColorContext provider', () => {
    // Every committed Storybook story for this section renders without a
    // PerceivedColorContext.Provider, as do the component tests above.
    // Mounting the readout must not change what renders in that case, or
    // every one of those story baselines would move.
    renderWithSurface(<WallFinishSection {...props} />)

    expect(document.querySelector('[data-perceived]')).toBeNull()
  })
})
