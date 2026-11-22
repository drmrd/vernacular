import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent, fn } from 'storybook/test'
import type { ProjectCardModel } from '../../session'
import { CardList } from './card-list'

const CHANGED_AT = '2026-03-04T10:15:00.000Z'
const FLOORS = 2

const hubbard: ProjectCardModel = {
  id: 'hubbard',
  name: 'Hubbard House',
  lastChangedAt: CHANGED_AT,
  floorCount: FLOORS,
  location: 'browser',
  preview: 'none',
  stateLines: [],
  actions: ['rename', 'export', 'delete'],
}

const queenAnne: ProjectCardModel = {
  ...hubbard,
  id: 'queen-anne',
  name: 'Queen Anne Cottage',
  floorCount: 1,
  location: { folderName: 'Old house' },
  actions: ['rename', 'export', 'remove-from-list'],
}

const meta: Meta<typeof CardList> = {
  title: 'Editor/CardList',
  component: CardList,
  tags: ['autodocs'],
  args: {
    cards: [hubbard, queenAnne],
    hrefFor: (id: string) => `#/project/${id}`,
    onOpen: fn(),
    cardActions: {
      onRename: fn(() => Promise.resolve(true)),
      onExport: fn(),
      onDelete: fn(),
      onRemoveFromList: fn(),
    },
    page: { current: null },
  },
}

export default meta

type Story = StoryObj<typeof CardList>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByRole('link', { name: 'Hubbard House' })).toBeInTheDocument()
    await expect(screen.getByRole('link', { name: 'Queen Anne Cottage' })).toBeInTheDocument()
  },
}

export const WorkspaceCardActions: Story = {
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Hubbard House' }))
    await expect(await screen.findByRole('menuitem', { name: 'Rename' })).toBeVisible()
    await expect(screen.getByRole('menuitem', { name: 'Export' })).toBeVisible()
    await expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeVisible()
  },
}

export const FolderCardActions: Story = {
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Queen Anne Cottage' }))
    await expect(await screen.findByRole('menuitem', { name: 'Rename' })).toBeVisible()
    await expect(screen.getByRole('menuitem', { name: 'Export' })).toBeVisible()
    await expect(screen.getByRole('menuitem', { name: 'Remove from list' })).toBeVisible()
  },
}
