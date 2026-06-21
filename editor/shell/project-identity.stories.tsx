import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect } from 'storybook/test'
import { ProjectIdentity } from './project-identity'

const meta: Meta<typeof ProjectIdentity> = {
  title: 'Editor/ProjectIdentity',
  component: ProjectIdentity,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof ProjectIdentity>

export const WithPeriod: Story = {
  render: () => <ProjectIdentity name="Maple Street House" periodLabel="Queen Anne Victorian" />,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByRole('heading', { name: 'Maple Street House' })).toBeInTheDocument()
    await expect(screen.getByText('Queen Anne Victorian')).toBeInTheDocument()
  },
}

export const WithoutPeriod: Story = {
  render: () => <ProjectIdentity name="Untitled Project" periodLabel={undefined} />,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByRole('heading', { name: 'Untitled Project' })).toBeInTheDocument()
  },
}
