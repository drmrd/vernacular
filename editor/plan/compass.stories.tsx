import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect } from 'storybook/test'
import { Compass } from './compass'

const meta: Meta<typeof Compass> = {
  title: 'Editor/Compass',
  component: Compass,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof Compass>

export const Default: Story = {
  render: () => <Compass />,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByRole('img', { name: /north/i })).toBeInTheDocument()
    await expect(screen.getByText('N')).toBeInTheDocument()
  },
}
