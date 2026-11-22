import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, fn } from 'storybook/test'
import { FailedOpenDialog } from './failed-open-dialog'

const FORMAT_VERSION = 17

const meta: Meta<typeof FailedOpenDialog> = {
  title: 'Editor/FailedOpenDialog',
  component: FailedOpenDialog,
  tags: ['autodocs'],
  args: {
    cause: 'format-rules',
    details: {
      error: 'The document breaks the format rules at 1 place.',
      faults: [{ path: '/floors/0/x-old', message: 'The field is not defined.' }],
      formatVersion: FORMAT_VERSION,
      build: '0.3.0',
      removedPaths: [],
    },
    onClose: fn(),
    onExport: fn(),
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

type Story = StoryObj<typeof FailedOpenDialog>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(
      screen.getByRole('alertdialog', { name: 'This project did not open.' }),
    ).toBeVisible()
    await expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
    await expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument()
  },
}

export const ForAFile: Story = {
  args: {
    cause: 'file-too-large',
    source: 'file',
    onExport: undefined,
    details: {
      error: 'The file is larger than 512 MB.',
      faults: [],
      build: '0.3.0',
      removedPaths: [],
    },
  },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByRole('alertdialog', { name: 'This file did not open.' })).toBeVisible()
    await expect(screen.getByText('The file is larger than Vernacular can open.')).toBeVisible()
    await expect(screen.queryByRole('button', { name: 'Export' })).toBeNull()
  },
}

export const WithARepairOffer: Story = {
  args: {
    repairSentences: ['It removes the extra data from 2 paint entries.'],
    onOpenWithRepair: fn(),
    details: {
      error: 'The document breaks the format rules at 2 places.',
      faults: [{ path: '/floors/0/paint/0', message: 'The entry mixes two kinds.' }],
      formatVersion: FORMAT_VERSION,
      build: '0.3.0',
      removedPaths: ['/floors/0/paint/0/extra'],
    },
  },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByText('It removes the extra data from 2 paint entries.')).toBeVisible()
    await expect(screen.getByRole('button', { name: 'Open with the repair' })).toBeVisible()
  },
}

export const WhenTheStorageDidNotAnswer: Story = {
  args: {
    cause: 'storage-unavailable',
    onTryAgain: fn(),
    details: {
      error: 'The request to the storage timed out.',
      faults: [],
      build: '0.3.0',
      removedPaths: [],
    },
  },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByText('The storage did not answer.')).toBeVisible()
    await expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible()
  },
}
