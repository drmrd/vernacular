import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent } from 'storybook/test'
import { SnapPreferencesProvider } from '../plan/snap-preferences-provider'
import { createSnapPreferencesStore } from '../plan/snap-preferences-store'
import { SnapStatus } from './snap-status'

const meta: Meta<typeof SnapStatus> = {
  title: 'Editor/SnapStatus',
  component: SnapStatus,
  tags: ['autodocs'],
  decorators: [
    (story) => (
      <SnapPreferencesProvider store={createSnapPreferencesStore()}>
        {story()}
      </SnapPreferencesProvider>
    ),
  ],
}

export default meta

type Story = StoryObj<typeof SnapStatus>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    const indicator = screen.getByRole('button', { expanded: false })
    await userEvent.click(indicator)
    await expect(
      await screen.findByRole('dialog', { name: 'Snapping precision' }),
    ).toBeInTheDocument()
  },
}
