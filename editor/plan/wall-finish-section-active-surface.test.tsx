import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SurfaceSelectionContext } from '../../bridge/react/surface-selection-context'
import { createSurfaceSelectionStore } from '../../bridge/selection/surface-selection-store'
import { PerceivedColorContext } from '../../bridge/react/perceived-color-context'
import { createPerceivedColorStore } from '../../bridge/perceived-color/perceived-color-store'
import {
  builtinPalettes,
  colorFromHex,
  solidTreatment,
  surfaceKey,
  type Command,
  type SurfaceRef,
  type SurfaceTreatment,
} from '../../core'
import { WallFinishSection } from './wall-finish-section'

afterEach(cleanup)

// The section shows the wall face the 3D view picked: it follows the active surface
// instead of starting at the left face and keeping its own side.

const RIGHT_FACE: SurfaceRef = { kind: 'wall-face', wallId: 'w1', side: 'right' }
const LEFT_FACE: SurfaceRef = { kind: 'wall-face', wallId: 'w1', side: 'left' }
const FIRST_COLOR = Object.values(builtinPalettes.entries)[0]!.colors[0]!
const SAMPLE = colorFromHex('#a1b2c3')

function renderSection(
  active: SurfaceRef | null,
  props: Partial<Parameters<typeof WallFinishSection>[0]> = {},
  sampledOn: SurfaceRef | null = null,
) {
  const surfaceSelection = createSurfaceSelectionStore()
  if (active !== null) surfaceSelection.select(active)
  const perceivedColor = createPerceivedColorStore()
  if (sampledOn !== null) perceivedColor.resolveSample({ surface: sampledOn, color: SAMPLE })
  const dispatch = vi.fn()
  render(
    <SurfaceSelectionContext.Provider value={surfaceSelection}>
      <PerceivedColorContext.Provider value={perceivedColor}>
        <WallFinishSection
          wallId="w1"
          treatmentFor={() => undefined}
          recent={[]}
          dispatch={dispatch}
          {...props}
        />
      </PerceivedColorContext.Provider>
    </SurfaceSelectionContext.Provider>,
  )
  return { surfaceSelection, dispatch }
}

const dispatchedKey = (dispatch: ReturnType<typeof vi.fn>): string =>
  (dispatch.mock.calls[0]?.[0] as Command<{ key: string }>).params.key

describe('WallFinishSection with a wall face active from the 3D view', () => {
  it('shows the right face as the chosen side', () => {
    renderSection(RIGHT_FACE)

    expect(screen.getByRole('button', { name: 'B' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'A' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows the left face as the chosen side when the left face is active', () => {
    renderSection(LEFT_FACE)

    expect(screen.getByRole('button', { name: 'A' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('paints the right face when a color is applied through the section', async () => {
    const user = userEvent.setup()
    const { dispatch } = renderSection(RIGHT_FACE)

    await user.click(screen.getByRole('button', { name: FIRST_COLOR.name }))

    expect(dispatchedKey(dispatch)).toBe(surfaceKey(RIGHT_FACE))
  })

  it('paints the right face when a finish is applied through the section', async () => {
    const user = userEvent.setup()
    const painted = (ref: SurfaceRef): SurfaceTreatment | undefined =>
      surfaceKey(ref) === surfaceKey(RIGHT_FACE)
        ? solidTreatment(FIRST_COLOR.color, 'matte')
        : undefined
    const { dispatch } = renderSection(RIGHT_FACE, { treatmentFor: painted })

    await user.click(screen.getByRole('radio', { name: /satin/i }))

    expect(dispatchedKey(dispatch)).toBe(surfaceKey(RIGHT_FACE))
  })

  it('shows the perceived-color readout sampled on the right face', () => {
    renderSection(RIGHT_FACE, {}, RIGHT_FACE)

    expect(screen.getByText(SAMPLE.srgbHex)).toHaveAttribute('data-perceived', SAMPLE.srgbHex)
  })
})

describe('WallFinishSection when the user changes the side', () => {
  it('makes the chosen face the active surface', async () => {
    const user = userEvent.setup()
    const { surfaceSelection } = renderSection(LEFT_FACE)

    await user.click(screen.getByRole('button', { name: 'B' }))
    expect(surfaceSelection.getActiveSurface()).toEqual(RIGHT_FACE)

    await user.click(screen.getByRole('button', { name: 'A' }))
    expect(surfaceSelection.getActiveSurface()).toEqual(LEFT_FACE)
  })
})

describe('WallFinishSection when the active surface is a face of another wall', () => {
  const FOREIGN_FACE: SurfaceRef = { kind: 'wall-face', wallId: 'w2', side: 'right' }

  it('shows the left side as the chosen side', () => {
    renderSection(FOREIGN_FACE)

    expect(screen.getByRole('button', { name: 'A' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'B' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('paints the left face of its own wall when a color is applied', async () => {
    const user = userEvent.setup()
    const { dispatch } = renderSection(FOREIGN_FACE)

    await user.click(screen.getByRole('button', { name: FIRST_COLOR.name }))

    expect(dispatchedKey(dispatch)).toBe(surfaceKey(LEFT_FACE))
  })

  it('shows no perceived-color readout for a sample on the foreign face', () => {
    renderSection(FOREIGN_FACE, {}, FOREIGN_FACE)

    expect(screen.queryByText(SAMPLE.srgbHex)).not.toBeInTheDocument()
  })

  it('shows the perceived-color readout for a sample on its own left face', () => {
    renderSection(FOREIGN_FACE, {}, LEFT_FACE)

    expect(screen.getByText(SAMPLE.srgbHex)).toHaveAttribute('data-perceived', SAMPLE.srgbHex)
  })
})
