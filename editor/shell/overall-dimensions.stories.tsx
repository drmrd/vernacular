import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect } from 'storybook/test'
import { OverallDimensions } from './overall-dimensions'

const meta: Meta<typeof OverallDimensions> = {
  title: 'Editor/OverallDimensions',
  component: OverallDimensions,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof OverallDimensions>

export const Default: Story = {
  render: () => <OverallDimensions extent={{ width: '24 ft', height: '18 ft' }} />,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByText('24 ft × 18 ft')).toBeInTheDocument()
  },
}
