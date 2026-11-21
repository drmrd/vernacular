import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, fn } from 'storybook/test'
import { ProjectCard } from './project-card'

const CHANGED_AT = '2026-03-04T10:15:00.000Z'
const FLOORS = 2

const meta: Meta<typeof ProjectCard> = {
  title: 'Editor/ProjectCard',
  component: ProjectCard,
  tags: ['autodocs'],
  decorators: [(story) => <ul>{story()}</ul>],
  args: {
    card: {
      id: 'hubbard',
      name: 'Hubbard House',
      lastChangedAt: CHANGED_AT,
      floorCount: FLOORS,
      location: 'browser',
      preview: 'none',
      stateLines: ['open-here'],
      actions: ['rename', 'export', 'delete'],
    },
    href: '#/project/hubbard',
    onOpen: fn(),
    onAction: fn(),
  },
}

export default meta

type Story = StoryObj<typeof ProjectCard>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByRole('link', { name: 'Hubbard House' })).toBeInTheDocument()
    await expect(screen.getByText('Already open in this tab.')).toBeInTheDocument()
    await expect(
      screen.getByRole('button', { name: 'Actions for Hubbard House' }),
    ).toBeInTheDocument()
  },
}
