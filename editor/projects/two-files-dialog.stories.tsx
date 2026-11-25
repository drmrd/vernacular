import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, fn } from 'storybook/test'
import { TwoFilesDialog } from './two-files-dialog'

const meta: Meta<typeof TwoFilesDialog> = {
  title: 'Editor/TwoFilesDialog',
  component: TwoFilesDialog,
  tags: ['autodocs'],
  args: {
    state: 'newer-main',
    secondFileName: 'vernacular.format-17.json',
    onKeepBoth: fn(),
    onOpenAsNew: fn(),
    onReplace: fn(),
  },
  decorators: [
    (story) => (
      // The dialog's backdrop is pinned to the viewport. A transform on this wrapper makes it the
      // containing block for fixed descendants, so the entry shows the dialog in a bounded area.
      <div style={{ height: '32rem', transform: 'translate(0)' }}>{story()}</div>
    ),
  ],
}

export default meta

type Story = StoryObj<typeof TwoFilesDialog>

export const NewerFile: Story = {
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(
      screen.getByRole('alertdialog', { name: 'This project has two plan files' }),
    ).toBeVisible()
    await expect(screen.getByRole('button', { name: 'Keep both plan files' })).toHaveFocus()
    await expect(screen.queryByRole('button', { name: 'Remove the second plan file' })).toBeNull()
  },
}

export const BothReadable: Story = {
  args: {
    state: 'both-readable',
    mainChangedAt: '2026-11-20T09:30:00.000Z',
    secondChangedAt: '2026-11-21T17:45:00.000Z',
    onRemove: fn(),
  },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByRole('button', { name: 'Remove the second plan file' })).toBeVisible()
    await expect(
      screen.getByRole('button', { name: 'Replace vernacular.json with the second plan file' }),
    ).toBeVisible()
  },
}

export const BeforeAnOpen: Story = {
  args: {
    state: 'both-readable',
    beforeOpen: true,
    onRemove: fn(),
    onCancel: fn(),
  },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(
      screen.getByRole('button', { name: 'Open and keep both plan files' }),
    ).toHaveFocus()
    await expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible()
  },
}
