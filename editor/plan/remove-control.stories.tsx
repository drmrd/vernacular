import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent, fn } from 'storybook/test'
import { RemoveControl } from './remove-control'

const meta: Meta<typeof RemoveControl> = {
  title: 'Editor/RemoveControl',
  component: RemoveControl,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof RemoveControl>

export const Default: Story = {
  args: { onConfirm: fn() },
  play: async ({ args, canvasElement }) => {
    const screen = within(canvasElement)

    // The first click only arms the action; nothing fires yet.
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await expect(args.onConfirm).not.toHaveBeenCalled()

    // The confirm step replaces the plain control with confirm and cancel.
    await expect(screen.getByRole('button', { name: 'Confirm remove' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm remove' }))
    await expect(args.onConfirm).toHaveBeenCalledTimes(1)
  },
}

export const Cancelled: Story = {
  args: { onConfirm: fn() },
  play: async ({ args, canvasElement }) => {
    const screen = within(canvasElement)

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    // Cancel never deletes and restores the plain Remove control.
    await expect(args.onConfirm).not.toHaveBeenCalled()
    await expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
  },
}
