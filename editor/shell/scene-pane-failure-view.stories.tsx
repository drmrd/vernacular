import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, fn, userEvent } from 'storybook/test'
import { ScenePaneFailureView } from './scene-pane-failure-view'

const meta: Meta<typeof ScenePaneFailureView> = {
  title: 'Editor/ScenePaneFailureView',
  component: ScenePaneFailureView,
  tags: ['autodocs'],
  decorators: [(story) => <div style={{ width: '32rem', height: '20rem' }}>{story()}</div>],
}

export default meta

type Story = StoryObj<typeof ScenePaneFailureView>

export const CouldNotLoad: Story = {
  args: { kind: 'load', onReload: fn() },
  play: async ({ canvasElement, args }) => {
    const screen = within(canvasElement)
    await expect(
      screen.getByRole('heading', { name: 'Could not load the 3D view' }),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reload page' }))
    if (args.kind === 'load') await expect(args.onReload).toHaveBeenCalledTimes(1)
  },
}

export const CannotRender: Story = {
  args: { kind: 'start' },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(
      screen.getByRole('heading', { name: 'This browser cannot render the 3D view' }),
    ).toBeInTheDocument()
    await expect(screen.queryByRole('button')).toBeNull()
  },
}
