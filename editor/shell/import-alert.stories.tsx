import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent, fn } from 'storybook/test'
import { ImportAlert } from './import-alert'

const meta: Meta<typeof ImportAlert> = {
  title: 'Editor/ImportAlert',
  component: ImportAlert,
  tags: ['autodocs'],
  args: {
    status: { fileName: 'attic-plan.building', reason: 'unsupported file format' },
    onDismiss: fn(),
  },
}

export default meta

type Story = StoryObj<typeof ImportAlert>

export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByRole('alert')).toHaveTextContent(/attic-plan\.building/)
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    await expect(args.onDismiss).toHaveBeenCalled()
  },
}
