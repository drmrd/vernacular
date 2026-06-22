import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { Banner } from './banner'

const meta = {
  title: 'Notifications/Banner',
  component: Banner,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Banner>
export default meta
type Story = StoryObj<typeof meta>

export const DegradedStorage: Story = {
  args: {
    notification: {
      id: 'storage-degraded',
      tier: 'banner',
      severity: 'warning',
      message: 'Storage is unavailable. Your work will not be saved between sessions.',
      dismissible: true,
    },
    onDismiss: () => {},
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('alert')).toBeInTheDocument()
  },
}
