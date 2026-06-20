import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect } from 'storybook/test'
import { IconButton } from './index'

const meta: Meta<typeof IconButton> = {
  title: 'Design System/IconButton',
  component: IconButton,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof IconButton>

export const Default: Story = {
  render: () => <IconButton aria-label="Zoom in">+</IconButton>,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByRole('button', { name: 'Zoom in' })).toBeInTheDocument()
  },
}

export const Labeled: Story = {
  render: () => <IconButton labeled>Imperial</IconButton>,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByRole('button', { name: 'Imperial' })).toBeInTheDocument()
  },
}
