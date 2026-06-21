import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent, fn } from 'storybook/test'
import { ExportMenu } from './export-menu'

const meta: Meta<typeof ExportMenu> = {
  title: 'Editor/ExportMenu',
  component: ExportMenu,
  tags: ['autodocs'],
  args: {
    onExportBundle: fn(),
    onExportPlan: fn(),
    onExportImage: fn(),
    onExportPdf: fn(),
  },
}

export default meta

type Story = StoryObj<typeof ExportMenu>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await userEvent.click(screen.getByRole('button', { name: /^export$/i }))
    await expect(await screen.findByRole('menuitem', { name: /bundle/i })).toBeInTheDocument()
  },
}
