import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect } from 'storybook/test'
import { PanelSlot } from './index'

const meta: Meta<typeof PanelSlot> = {
  title: 'Design System/PanelSlot',
  component: PanelSlot,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof PanelSlot>

export const WithChildren: Story = {
  render: () => (
    <PanelSlot slotId="left" label="Tools">
      <button type="button">Wall</button>
    </PanelSlot>
  ),
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    const region = screen.getByRole('region', { name: 'Tools' })
    await expect(within(region).getByRole('button', { name: 'Wall' })).toBeInTheDocument()
  },
}

export const Empty: Story = {
  render: () => <PanelSlot slotId="left" label="Tools" emptyTitle="No tools yet" />,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByRole('region', { name: 'Tools' })).toBeInTheDocument()
    await expect(screen.getByRole('heading', { name: 'No tools yet' })).toBeInTheDocument()
  },
}
