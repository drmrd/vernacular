import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent, fn } from 'storybook/test'
import { SurfaceSelectionProvider, createSurfaceSelectionStore } from '../../bridge'
import { WallFinishSection } from './wall-finish-section'

const meta: Meta<typeof WallFinishSection> = {
  title: 'Editor/WallFinishSection',
  component: WallFinishSection,
  tags: ['autodocs'],
  decorators: [
    (story) => (
      <SurfaceSelectionProvider store={createSurfaceSelectionStore()}>
        {story()}
      </SurfaceSelectionProvider>
    ),
  ],
}

export default meta

type Story = StoryObj<typeof WallFinishSection>

// A store the PlanHighlightedFace story drives in its play step to stand in for a
// plan canvas hover, held at module scope so play and the decorator share the instance.
const highlightStore = createSurfaceSelectionStore()

export const Default: Story = {
  args: {
    wallId: 'w1',
    // No treatment yet, so the color picker seeds at the default matte finish
    // and the finish picker stays hidden until a color is chosen.
    treatmentFor: () => undefined,
    recent: [],
    dispatch: fn(),
  },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)

    // Both paintable faces are offered; Face A is active by default.
    const faceA = screen.getByRole('button', { name: 'A' })
    const faceB = screen.getByRole('button', { name: 'B' })
    await expect(faceA).toHaveAttribute('aria-pressed', 'true')
    await expect(faceB).toHaveAttribute('aria-pressed', 'false')

    // Selecting Face B moves the active face to the other side.
    await userEvent.click(faceB)
    await expect(screen.getByRole('button', { name: 'B' })).toHaveAttribute('aria-pressed', 'true')
    await expect(screen.getByRole('button', { name: 'A' })).toHaveAttribute('aria-pressed', 'false')
  },
}

// The reverse finish-chip link: the plan highlights this wall's B face (the store
// driven directly here, standing in for a canvas hover) while Face A stays selected,
// so the B chip wears the preview outline without becoming the pressed selection. The
// highlight is set in play, after mount, so the section's own mount highlight (which
// asserts the selected A face) does not overwrite it.
export const PlanHighlightedFace: Story = {
  args: {
    wallId: 'w1',
    treatmentFor: () => undefined,
    recent: [],
    dispatch: fn(),
  },
  decorators: [
    (story) => (
      <SurfaceSelectionProvider store={highlightStore}>{story()}</SurfaceSelectionProvider>
    ),
  ],
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    highlightStore.highlight({ kind: 'wall-face', wallId: 'w1', side: 'right' })
    const faceB = await screen.findByRole('button', { name: 'B' })
    await expect(faceB).toHaveClass('is-preview')
    await expect(faceB).toHaveAttribute('aria-pressed', 'false')
    await expect(screen.getByRole('button', { name: 'A' })).toHaveAttribute('aria-pressed', 'true')
  },
}
