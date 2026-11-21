import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent, fn } from 'storybook/test'
import { ProjectCardMenu } from './project-card-menu'

const meta: Meta<typeof ProjectCardMenu> = {
  title: 'Editor/ProjectCardMenu',
  component: ProjectCardMenu,
  tags: ['autodocs'],
  args: {
    projectName: 'Hubbard House',
    actions: ['rename', 'export', 'delete'],
    onAction: fn(),
  },
}

export default meta

type Story = StoryObj<typeof ProjectCardMenu>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Hubbard House' }))
    await expect(await screen.findByRole('menuitem', { name: 'Rename' })).toBeInTheDocument()
    await expect(screen.getByRole('menuitem', { name: 'Export' })).toBeInTheDocument()
    await expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()
  },
}

export const FolderProject: Story = {
  args: { actions: ['rename', 'export', 'remove-from-list'] },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Hubbard House' }))
    await expect(await screen.findByRole('menuitem', { name: 'Rename' })).toBeInTheDocument()
    await expect(screen.getByRole('menuitem', { name: 'Export' })).toBeInTheDocument()
    await expect(screen.getByRole('menuitem', { name: 'Remove from list' })).toBeInTheDocument()
    await expect(screen.queryByRole('menuitem', { name: 'Delete' })).not.toBeInTheDocument()
  },
}

export const OpenInAnotherTab: Story = {
  args: { actions: ['export'] },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Hubbard House' }))
    await expect(await screen.findByRole('menuitem', { name: 'Export' })).toBeInTheDocument()
    await expect(screen.getAllByRole('menuitem')).toHaveLength(1)
  },
}

export const DidNotOpen: Story = {
  args: { actions: ['export', 'delete'] },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Hubbard House' }))
    await expect(await screen.findByRole('menuitem', { name: 'Export' })).toBeInTheDocument()
    await expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()
    await expect(screen.queryByRole('menuitem', { name: 'Rename' })).not.toBeInTheDocument()
  },
}

export const FolderProjectDidNotOpen: Story = {
  args: { actions: ['export', 'remove-from-list'] },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Hubbard House' }))
    await expect(await screen.findByRole('menuitem', { name: 'Export' })).toBeInTheDocument()
    await expect(screen.getByRole('menuitem', { name: 'Remove from list' })).toBeInTheDocument()
    await expect(screen.queryByRole('menuitem', { name: 'Delete' })).not.toBeInTheDocument()
  },
}
