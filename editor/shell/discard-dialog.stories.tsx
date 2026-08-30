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
  decorators: [
    (story) => (
      // The prompt's backdrop is pinned to the viewport, which in a catalogue
      // entry would escape the story frame and leave the story root with no
      // height at all. A transform on this wrapper makes it the containing block
      // for fixed descendants, so the entry shows the prompt on a bounded stage.
      <div style={{ height: '16rem', transform: 'translate(0)' }}>{story()}</div>
    ),
  ],
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
