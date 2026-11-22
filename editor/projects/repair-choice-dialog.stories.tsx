import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, fn } from 'storybook/test'
import { RepairChoiceDialog } from './repair-choice-dialog'

const meta: Meta<typeof RepairChoiceDialog> = {
  title: 'Editor/RepairChoiceDialog',
  component: RepairChoiceDialog,
  tags: ['autodocs'],
  args: {
    onReplace: fn(),
    onOpenAsNew: fn(),
    onCancel: fn(),
  },
  decorators: [
    (story) => (
      // The dialog's backdrop is pinned to the viewport. A transform on this wrapper makes it the
      // containing block for fixed descendants, so the entry shows the dialog on a bounded stage.
      <div style={{ height: '24rem', transform: 'translate(0)' }}>{story()}</div>
    ),
  ],
}

export default meta

type Story = StoryObj<typeof RepairChoiceDialog>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(
      screen.getByRole('alertdialog', { name: 'Open the repaired project' }),
    ).toBeVisible()
    await expect(screen.getByRole('button', { name: 'Open as a new project' })).toHaveFocus()
    await expect(screen.getByRole('button', { name: 'Replace the stored project' })).toBeVisible()
  },
}
