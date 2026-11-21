import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, fn } from 'storybook/test'
import type { ProjectCardModel } from '../../session'
import { ProjectsPage } from './projects-page'

const CHANGED_AT = '2026-03-04T10:15:00.000Z'
const FLOORS = 2
const DRAWING =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60">' +
  '<rect x="5" y="5" width="90" height="50" fill="none" stroke="#444" stroke-width="2"/></svg>'

const WORKSPACE_ACTIONS: ProjectCardModel['actions'] = ['rename', 'export', 'delete']
const FOLDER_ACTIONS: ProjectCardModel['actions'] = ['rename', 'export', 'remove-from-list']

const hubbard: ProjectCardModel = {
  id: 'hubbard',
  name: 'Hubbard House',
  lastChangedAt: CHANGED_AT,
  floorCount: FLOORS,
  location: 'browser',
  preview: 'none',
  stateLines: [],
  actions: WORKSPACE_ACTIONS,
}

const queenAnne: ProjectCardModel = {
  ...hubbard,
  id: 'queen-anne',
  name: 'Queen Anne Cottage',
  floorCount: 1,
  location: { folderName: 'Old house' },
  actions: FOLDER_ACTIONS,
}

const cards: ProjectCardModel[] = [hubbard, queenAnne]

const everyKind: ProjectCardModel[] = [
  { ...hubbard, id: 'in-browser', name: 'In this browser', preview: { svg: DRAWING } },
  {
    ...queenAnne,
    id: 'in-folder',
    name: 'In a folder',
    preview: { svg: DRAWING },
  },
  {
    ...hubbard,
    id: 'tab-only',
    name: 'In this tab only',
    location: 'tab',
    preview: { svg: DRAWING },
  },
  {
    ...hubbard,
    id: 'open-here',
    name: 'Open in this tab',
    preview: { svg: DRAWING },
    stateLines: ['open-here'],
  },
  {
    ...hubbard,
    id: 'open-elsewhere',
    name: 'Open in another tab',
    preview: { svg: DRAWING },
    stateLines: ['open-elsewhere'],
    actions: ['export'],
  },
  {
    ...queenAnne,
    id: 'needs-permission',
    name: 'Needs permission',
    preview: { svg: DRAWING },
    stateLines: ['needs-permission'],
  },
  {
    ...hubbard,
    id: 'did-not-open',
    name: 'Did not open',
    preview: 'did-not-open',
    actions: ['export', 'delete'],
  },
  { ...hubbard, id: 'no-drawing', name: 'No drawing', preview: 'none' },
]

const meta: Meta<typeof ProjectsPage> = {
  title: 'Editor/ProjectsPage',
  component: ProjectsPage,
  tags: ['autodocs'],
  args: {
    cards,
    hrefFor: (id: string) => `#/project/${id}`,
    onOpen: fn(),
    onCardAction: fn(),
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

export const Empty: Story = {
  args: { cards: [] },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByText('There are no saved projects yet.')).toBeInTheDocument()
    await expect(screen.getByRole('button', { name: 'New project' })).toBeInTheDocument()
    await expect(screen.queryAllByRole('link')).toHaveLength(0)
  },
}

export const OneCardOfEachKind: Story = {
  args: { cards: everyKind },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getAllByRole('link')).toHaveLength(everyKind.length)
    await expect(screen.getByText('Already open in another tab.')).toBeInTheDocument()
    await expect(screen.getByText('This folder needs permission again.')).toBeInTheDocument()
    await expect(screen.getByText('This project did not open.')).toBeInTheDocument()
  },
}

export const WithProjectOpenAndNotice: Story = {
  args: {
    openProject: { name: 'Hubbard House', onBack: fn() },
    notice: 'Could not open the project: The stored file is not a project document.',
  },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not open the project: The stored file is not a project document.',
    )
    await expect(screen.getByRole('button', { name: 'Back to Hubbard House' })).toBeInTheDocument()
  },
}
