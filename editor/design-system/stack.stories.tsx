import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect } from 'storybook/test'
import { Stack } from './index'

const meta: Meta<typeof Stack> = {
  title: 'Design System/Stack',
  component: Stack,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof Stack>

export const Vertical: Story = {
  render: () => (
    <Stack>
      <span>First</span>
      <span>Second</span>
    </Stack>
  ),
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByText('First')).toBeInTheDocument()
    await expect(screen.getByText('Second')).toBeInTheDocument()
  },
}

export const Horizontal: Story = {
  render: () => (
    <Stack direction="horizontal">
      <span>Left</span>
      <span>Right</span>
    </Stack>
  ),
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByText('Left')).toBeInTheDocument()
    await expect(screen.getByText('Right')).toBeInTheDocument()
  },
}
