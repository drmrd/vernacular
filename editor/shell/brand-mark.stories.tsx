import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect } from 'storybook/test'
import { BrandMark } from './brand-mark'

const meta: Meta<typeof BrandMark> = {
  title: 'Editor/BrandMark',
  component: BrandMark,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof BrandMark>

export const Default: Story = {
  render: () => <BrandMark />,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByRole('img', { name: 'Vernacular' })).toBeInTheDocument()
  },
}
