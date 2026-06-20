import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect } from 'storybook/test'
import { EmptyState, LoadingState } from './index'

const meta: Meta<typeof EmptyState> = {
  title: 'Design System/Status',
  component: EmptyState,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof EmptyState>

export const Empty: Story = {
  render: () => (
    <EmptyState title="No furniture yet" description="Import a model to get started." />
  ),
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByRole('region', { name: 'No furniture yet' })).toBeInTheDocument()
  },
}

export const EmptyNested: Story = {
  render: () => <EmptyState title="Nothing selected" asRegion={false} />,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByRole('heading', { name: 'Nothing selected' })).toBeInTheDocument()
    expect(screen.queryByRole('region')).toBeNull()
  },
}

export const Loading: Story = {
  render: () => <LoadingState message="Loading library..." />,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByRole('status')).toHaveTextContent('Loading library...')
  },
}
