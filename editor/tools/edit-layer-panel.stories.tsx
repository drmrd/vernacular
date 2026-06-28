import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent } from 'storybook/test'
import { EditLayerProvider } from './edit-layer-provider'
import { EditLayerPanel } from './edit-layer-panel'

const meta: Meta<typeof EditLayerPanel> = {
  title: 'Editor/EditLayerPanel',
  component: EditLayerPanel,
  tags: ['autodocs'],
  decorators: [(story) => <EditLayerProvider>{story()}</EditLayerProvider>],
}

export default meta

type Story = StoryObj<typeof EditLayerPanel>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)

    const all = screen.getByRole('radio', { name: /^all$/i })
    const walls = screen.getByRole('radio', { name: /^walls$/i })
    await expect(all).toHaveAttribute('aria-checked', 'true')
    await expect(walls).toHaveAttribute('aria-checked', 'false')

    await userEvent.click(walls)

    await expect(walls).toHaveAttribute('aria-checked', 'true')
    await expect(all).toHaveAttribute('aria-checked', 'false')
  },
}
