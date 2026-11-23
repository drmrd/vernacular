import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, fn, userEvent } from 'storybook/test'
import { ScenePaneFailureView } from './scene-pane-failure-view'
import { LOAD_TITLE, START_TITLE } from './scene-failure-text-test-support'

const onReload = fn()

const meta: Meta<typeof ScenePaneFailureView> = {
  title: 'Editor/ScenePaneFailureView',
  component: ScenePaneFailureView,
  tags: ['autodocs'],
  decorators: [(story) => <div style={{ width: '32rem', height: '20rem' }}>{story()}</div>],
}

export default meta

type Story = StoryObj<typeof ScenePaneFailureView>

export const CouldNotLoad: Story = {
  args: { kind: 'load', onReload },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByRole('heading', { name: LOAD_TITLE })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reload page' }))
    await expect(onReload).toHaveBeenCalledTimes(1)
  },
}

export const CannotRender: Story = {
  args: { kind: 'start' },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByRole('heading', { name: START_TITLE })).toBeInTheDocument()
    await expect(screen.queryByRole('button')).toBeNull()
  },
}
