import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn, within, expect, userEvent } from 'storybook/test'
import { SceneLoadFailedStatus } from './scene-load-failed-status'

const meta: Meta<typeof SceneLoadFailedStatus> = {
  title: 'Bridge/SceneLoadFailedStatus',
  component: SceneLoadFailedStatus,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof SceneLoadFailedStatus>

export const Default: Story = {
  args: { onReload: fn() },
  play: async ({ canvasElement, args }) => {
    const screen = within(canvasElement)
    await expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not load the 3D view. Check your network connection, then reload the page.',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Reload page' }))
    await expect(args.onReload).toHaveBeenCalled()
  },
}
