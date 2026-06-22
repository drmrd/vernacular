import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { Toast } from './toast'

const meta = {
  title: 'Notifications/Toast',
  component: Toast,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Toast>
export default meta
type Story = StoryObj<typeof meta>

export const Error: Story = {
  args: {
    notification: {
      id: 'a',
      tier: 'toast',
      severity: 'error',
      message: 'Save failed: disk full',
      dismissible: true,
      actions: [{ label: 'Retry', onAction: () => {} }],
    },
    onDismiss: () => {},
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('alert')).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  },
}

export const Success: Story = {
  args: {
    notification: {
      id: 'b',
      tier: 'toast',
      severity: 'success',
      message: 'Exported plan.pdf',
      dismissible: true,
    },
    onDismiss: () => {},
  },
}
