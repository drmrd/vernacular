import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, fn } from 'storybook/test'
import { DiscardDialog } from './discard-dialog'

const meta: Meta<typeof DiscardDialog> = {
  title: 'Editor/DiscardDialog',
  component: DiscardDialog,
  tags: ['autodocs'],
  args: {
    open: true,
    projectName: 'Hubbard House',
    onConfirm: fn(),
    onCancel: fn(),
  },
}

export default meta

type Story = StoryObj<typeof DiscardDialog>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByRole('alertdialog')).toHaveTextContent(/Hubbard House/)
    await expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    await expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument()
  },
}
