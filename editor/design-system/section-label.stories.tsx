import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect } from 'storybook/test'
import { SectionLabel } from './index'

const meta: Meta<typeof SectionLabel> = {
  title: 'Design System/SectionLabel',
  component: SectionLabel,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof SectionLabel>

export const Default: Story = {
  render: () => <SectionLabel>Layers</SectionLabel>,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByText('Layers')).toBeInTheDocument()
  },
}
