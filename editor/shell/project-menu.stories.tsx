import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent, fn } from 'storybook/test'
import { ProjectMenu } from './project-menu'

const meta: Meta<typeof ProjectMenu> = {
  title: 'Editor/ProjectMenu',
  component: ProjectMenu,
  tags: ['autodocs'],
  args: {
    onNewProject: fn(),
    onOpenFile: fn(),
    onOpenFolder: fn(),
    onOpenRecent: fn(),
    recentProjects: [{ id: 'hubbard', name: 'Hubbard House' }],
  },
}

export default meta

type Story = StoryObj<typeof ProjectMenu>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await userEvent.click(screen.getByRole('button', { name: /project/i }))
    await expect(await screen.findByRole('menuitem', { name: 'New project' })).toBeInTheDocument()
    await expect(screen.getByRole('menuitem', { name: 'Open folder' })).toBeInTheDocument()
    await expect(screen.getByRole('menuitem', { name: 'Hubbard House' })).toBeInTheDocument()
  },
}
