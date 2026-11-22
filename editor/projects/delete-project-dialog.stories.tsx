import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, fn } from 'storybook/test'
import { DeleteProjectDialog } from './delete-project-dialog'

const meta: Meta<typeof DeleteProjectDialog> = {
  title: 'Editor/DeleteProjectDialog',
  component: DeleteProjectDialog,
  tags: ['autodocs'],
  args: {
    name: 'Hubbard House',
    onConfirm: fn(),
    onCancel: fn(),
  },
  decorators: [
    (story) => (
      // The dialog's backdrop is pinned to the viewport. A transform on this wrapper makes it the
      // containing block for fixed descendants, so the entry shows the dialog on a bounded stage.
      <div style={{ height: '16rem', transform: 'translate(0)' }}>{story()}</div>
    ),
  ],
}

export default meta

type Story = StoryObj<typeof DeleteProjectDialog>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByRole('alertdialog', { name: 'Delete "Hubbard House"?' })).toBeVisible()
    await expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await expect(screen.getByRole('button', { name: 'Delete project' })).toBeInTheDocument()
  },
}
