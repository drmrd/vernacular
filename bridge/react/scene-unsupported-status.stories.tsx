import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect } from 'storybook/test'
import { SceneUnsupportedStatus } from './scene-unsupported-status'

const meta: Meta<typeof SceneUnsupportedStatus> = {
  title: 'Bridge/SceneUnsupportedStatus',
  component: SceneUnsupportedStatus,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof SceneUnsupportedStatus>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByRole('status')).toHaveTextContent(
      'This browser cannot render the 3D view.',
    )
  },
}
