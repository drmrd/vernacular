import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  colorFromHex,
  solidTreatment,
  surfaceKey,
  type PaintableSurface,
  type SurfaceRef,
  type SurfaceTreatment,
} from '../../core'
import { PaintPanel } from './paint-panel'

const WALL_REF: SurfaceRef = { kind: 'wall-face', wallId: 'wall-1', side: 'left' }
const FLOOR_REF: SurfaceRef = { kind: 'floor', floorId: 'floor-1' }

const SURFACES: readonly PaintableSurface[] = [
  { ref: WALL_REF, label: 'Wall 1 (side A)', group: 'wall' },
  { ref: FLOOR_REF, label: 'Floor', group: 'floor-ceiling' },
]

const PAINT_COLOR = colorFromHex('#6f7d63')

const noTreatment = (): SurfaceTreatment | undefined => undefined

function renderPanel(overrides: Partial<Parameters<typeof PaintPanel>[0]> = {}) {
  const props = {
    surfaces: SURFACES,
    activeSurface: null,
    treatmentFor: noTreatment,
    recent: [],
    onSelectSurface: vi.fn(),
    dispatch: vi.fn(),
    ...overrides,
  }
  render(<PaintPanel {...props} />)
  return props
}

afterEach(cleanup)

describe('PaintPanel', () => {
  it('renders a button for each surface, addressable by its label', () => {
    renderPanel()

    expect(screen.getByRole('button', { name: 'Wall 1 (side A)' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Floor' })).toBeTruthy()
  })

  it('reports the clicked surface ref to onSelectSurface', async () => {
    const user = userEvent.setup()
    const { onSelectSurface } = renderPanel()

    await user.click(screen.getByRole('button', { name: 'Floor' }))

    expect(onSelectSurface).toHaveBeenCalledTimes(1)
    expect(onSelectSurface).toHaveBeenCalledWith(FLOOR_REF)
  })

  it('marks only the active surface button as pressed', () => {
    renderPanel({ activeSurface: WALL_REF })

    expect(
      screen.getByRole('button', { name: 'Wall 1 (side A)' }).getAttribute('aria-pressed'),
    ).toBe('true')
    expect(screen.getByRole('button', { name: 'Floor' }).getAttribute('aria-pressed')).not.toBe(
      'true',
    )
  })

  it('exposes the solid treatment color through data-paint, defaulting to none when unpainted', () => {
    const treatmentFor = (ref: SurfaceRef): SurfaceTreatment | undefined =>
      surfaceKey(ref) === surfaceKey(WALL_REF) ? solidTreatment(PAINT_COLOR, 'matte') : undefined

    renderPanel({ treatmentFor })

    expect(screen.getByRole('button', { name: 'Wall 1 (side A)' }).getAttribute('data-paint')).toBe(
      PAINT_COLOR.srgbHex,
    )
    expect(screen.getByRole('button', { name: 'Floor' }).getAttribute('data-paint')).toBe('none')
  })

  it('mounts the color picker when a surface is active', () => {
    renderPanel({ activeSurface: WALL_REF })

    expect(screen.getByRole('searchbox')).toBeTruthy()
  })

  it('shows a hint and no color picker when no surface is active', () => {
    renderPanel({ activeSurface: null })

    expect(screen.getByText(/select a surface to paint/i)).toBeTruthy()
    expect(screen.queryByRole('searchbox')).toBeNull()
  })

  it('mounts the finish picker when the active surface already has a solid treatment', () => {
    const treatmentFor = (ref: SurfaceRef): SurfaceTreatment | undefined =>
      surfaceKey(ref) === surfaceKey(WALL_REF) ? solidTreatment(PAINT_COLOR, 'matte') : undefined

    renderPanel({ activeSurface: WALL_REF, treatmentFor })

    expect(screen.getAllByRole('radio')).toHaveLength(6)
  })
})
