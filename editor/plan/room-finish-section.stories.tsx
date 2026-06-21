import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent, fn } from 'storybook/test'
import { RoomFinishSection } from './room-finish-section'

const meta: Meta<typeof RoomFinishSection> = {
  title: 'Editor/RoomFinishSection',
  component: RoomFinishSection,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof RoomFinishSection>

export const Default: Story = {
  args: {
    floorId: 'ground',
    // No treatment yet, so the color picker seeds at the default matte finish
    // and the finish picker stays hidden until a color is chosen.
    treatmentFor: () => undefined,
    recent: [],
    dispatch: fn(),
  },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)

    // Floor and Ceiling are the two paintable room surfaces; Floor is active first.
    const floor = screen.getByRole('button', { name: 'Floor' })
    const ceiling = screen.getByRole('button', { name: 'Ceiling' })
    await expect(floor).toHaveAttribute('aria-pressed', 'true')
    await expect(ceiling).toHaveAttribute('aria-pressed', 'false')

    // Selecting Ceiling moves the active surface to the other side.
    await userEvent.click(ceiling)
    await expect(screen.getByRole('button', { name: 'Ceiling' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(screen.getByRole('button', { name: 'Floor' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  },
}
