import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, fn } from 'storybook/test'
import type { ProjectCardModel } from '../../session'
import { ProjectsPage } from './projects-page'

const CHANGED_AT = '2026-03-04T10:15:00.000Z'
const FLOORS = 2

const cards: ProjectCardModel[] = [
  {
    id: 'hubbard',
    name: 'Hubbard House',
    lastChangedAt: CHANGED_AT,
    floorCount: FLOORS,
    location: 'browser',
    preview: 'none',
    stateLines: [],
    actions: ['rename', 'export', 'delete'],
  },
  {
    id: 'queen-anne',
    name: 'Queen Anne Cottage',
    lastChangedAt: CHANGED_AT,
    floorCount: 1,
    location: { folderName: 'Old house' },
    preview: 'none',
    stateLines: [],
    actions: ['rename', 'export', 'remove-from-list'],
  },
]

const meta: Meta<typeof ProjectsPage> = {
  title: 'Editor/ProjectsPage',
  component: ProjectsPage,
  tags: ['autodocs'],
  args: {
    cards,
    hrefFor: (id: string) => `#/project/${id}`,
    onNewProject: fn(),
    onImportFile: fn(),
    onOpenFolder: fn(),
  },
}

export default meta

type Story = StoryObj<typeof ProjectsPage>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByRole('heading', { name: 'Projects' })).toBeInTheDocument()
    await expect(screen.getByRole('link', { name: 'Hubbard House' })).toBeInTheDocument()
    await expect(screen.getByRole('button', { name: 'New project' })).toBeInTheDocument()
  },
}
