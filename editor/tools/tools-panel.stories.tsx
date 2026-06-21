import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent } from 'storybook/test'
import { ActiveToolProvider } from './active-tool-provider'
import { OpeningToolProvider } from '../plan/opening-tool-context'
import { ToolsPanel } from './tools-panel'

const meta: Meta<typeof ToolsPanel> = {
  title: 'Editor/ToolsPanel',
  component: ToolsPanel,
  tags: ['autodocs'],
  decorators: [
    (story) => (
      <ActiveToolProvider>
        <OpeningToolProvider>{story()}</OpeningToolProvider>
      </ActiveToolProvider>
    ),
  ],
}

export default meta

type Story = StoryObj<typeof ToolsPanel>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)

    const select = screen.getByRole('button', { name: /select/i })
    const wall = screen.getByRole('button', { name: /wall/i })
    await expect(select).toBeInTheDocument()
    await expect(wall).toBeInTheDocument()
    await expect(select).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(wall)

    await expect(wall).toHaveAttribute('aria-pressed', 'true')
    await expect(select).toHaveAttribute('aria-pressed', 'false')
  },
}
