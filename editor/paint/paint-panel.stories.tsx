import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent, fn } from 'storybook/test'
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

const PAINTED = colorFromHex('#6f7d63', 'Sage')

// The wall already wears a solid treatment so the surface row shows its swatch;
// the floor stays unpainted to contrast the two states.
const treatmentFor = (ref: SurfaceRef): SurfaceTreatment | undefined =>
  surfaceKey(ref) === surfaceKey(WALL_REF) ? solidTreatment(PAINTED, 'matte') : undefined

const meta: Meta<typeof PaintPanel> = {
  title: 'Editor/PaintPanel',
  component: PaintPanel,
  tags: ['autodocs'],
  args: {
    surfaces: SURFACES,
    activeSurface: null,
    treatmentFor,
    recent: [PAINTED],
    onSelectSurface: fn(),
    dispatch: fn(),
  },
}

export default meta

type Story = StoryObj<typeof PaintPanel>

export const NoSelection: Story = {
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(
      screen.getByRole('heading', { name: 'Select a surface to paint' }),
    ).toBeInTheDocument()
  },
}

export const Selecting: Story = {
  play: async ({ canvasElement, args }) => {
    const screen = within(canvasElement)
    await userEvent.click(screen.getByRole('button', { name: 'Floor' }))
    await expect(args.onSelectSurface).toHaveBeenCalledWith(FLOOR_REF)
  },
}

export const ActiveSurface: Story = {
  args: { activeSurface: WALL_REF },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(
      screen.getByRole('button', { name: 'Wall 1 (side A)', pressed: true }),
    ).toBeInTheDocument()
    await expect(screen.getByRole('searchbox')).toBeInTheDocument()
  },
}
