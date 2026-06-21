import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent, fn } from 'storybook/test'
import { WallFinishSection } from './wall-finish-section'

const meta: Meta<typeof WallFinishSection> = {
  title: 'Editor/WallFinishSection',
  component: WallFinishSection,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof WallFinishSection>

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
