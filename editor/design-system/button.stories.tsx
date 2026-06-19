import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect } from 'storybook/test'
import { Button } from './index'

const meta: Meta<typeof Button> = {
  title: 'Design System/Button',
  component: Button,
}

export default meta

type Story = StoryObj<typeof Button>

export const Default: Story = {
  render: () => <Button>Save</Button>,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  },
}
