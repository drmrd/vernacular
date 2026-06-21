import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent } from 'storybook/test'
import { SnapPanel } from './snap-panel'
import { SnapPreferencesProvider } from './snap-preferences-provider'
import { createSnapPreferencesStore } from './snap-preferences-store'

const meta: Meta<typeof SnapPanel> = {
  title: 'Editor/SnapPanel',
  component: SnapPanel,
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

type Story = StoryObj<typeof SnapPanel>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    const master = screen.getByRole('checkbox', { name: 'Snapping' })
    await expect(master).toBeChecked()
    await userEvent.click(master)
    await expect(master).not.toBeChecked()
  },
}
