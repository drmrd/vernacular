import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent, fn } from 'storybook/test'
import { ProjectControls } from './project-controls'

const meta: Meta<typeof ProjectControls> = {
  title: 'Editor/ProjectControls',
  component: ProjectControls,
  tags: ['autodocs'],
  args: {
    recentProjects: [
      { id: 'hubbard', name: 'Hubbard House' },
      { id: 'queen-anne', name: 'Queen Anne Cottage' },
    ],
    onNewProject: fn(),
    onSave: fn(),
    onOpenFolder: fn(),
    onOpenRecent: fn(),
  },
}

export default meta

type Story = StoryObj<typeof ProjectControls>

export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    const screen = within(canvasElement)
    await userEvent.click(screen.getByRole('button', { name: 'New' }))
    await expect(args.onNewProject).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Hubbard House' }))
    await expect(args.onOpenRecent).toHaveBeenCalledWith('hubbard')
  },
}
