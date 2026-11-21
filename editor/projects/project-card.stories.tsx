import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, fn } from 'storybook/test'
import type { ProjectCardModel } from '../../session'
import { ProjectCard } from './project-card'

const CHANGED_AT = '2026-03-04T10:15:00.000Z'
const FLOORS = 2
const DRAWING =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60">' +
  '<rect x="5" y="5" width="90" height="50" fill="none" stroke="#444" stroke-width="2"/></svg>'

const baseCard: ProjectCardModel = {
  id: 'hubbard',
  name: 'Hubbard House',
  lastChangedAt: CHANGED_AT,
  floorCount: FLOORS,
  location: 'browser',
  preview: 'none',
  stateLines: ['open-here'],
  actions: ['rename', 'export', 'delete'],
}

function cardWith(overrides: Partial<ProjectCardModel>): ProjectCardModel {
  return { ...baseCard, ...overrides }
}

const meta: Meta<typeof ProjectCard> = {
  title: 'Editor/ProjectCard',
  component: ProjectCard,
  tags: ['autodocs'],
  decorators: [(story) => <ul>{story()}</ul>],
  args: {
    card: baseCard,
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

export const InThisBrowser: Story = {
  args: { card: cardWith({ stateLines: [], preview: { svg: DRAWING } }) },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByText('In this browser.')).toBeInTheDocument()
    await expect(screen.queryByText('Already open in this tab.')).not.toBeInTheDocument()
  },
}

export const InAFolder: Story = {
  args: {
    card: cardWith({
      name: 'Queen Anne Cottage',
      location: { folderName: 'Old house' },
      stateLines: [],
      preview: { svg: DRAWING },
      actions: ['rename', 'export', 'remove-from-list'],
    }),
  },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByText('Folder: Old house')).toBeInTheDocument()
  },
}

export const InThisTabOnly: Story = {
  args: { card: cardWith({ location: 'tab', stateLines: [], preview: { svg: DRAWING } }) },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByText('In this tab only.')).toBeInTheDocument()
  },
}

export const OpenInThisTab: Story = {
  args: { card: cardWith({ preview: { svg: DRAWING } }) },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByText('Already open in this tab.')).toBeInTheDocument()
  },
}

export const OpenInAnotherTab: Story = {
  args: {
    card: cardWith({
      stateLines: ['open-elsewhere'],
      preview: { svg: DRAWING },
      actions: ['export'],
    }),
  },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByText('Already open in another tab.')).toBeInTheDocument()
  },
}

export const NeedsPermission: Story = {
  args: {
    card: cardWith({
      name: 'Queen Anne Cottage',
      location: { folderName: 'Old house' },
      stateLines: ['needs-permission'],
      preview: { svg: DRAWING },
      actions: ['rename', 'export', 'remove-from-list'],
    }),
  },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByText('This folder needs permission again.')).toBeInTheDocument()
  },
}

export const DidNotOpen: Story = {
  args: {
    card: cardWith({ stateLines: [], preview: 'did-not-open', actions: ['export', 'delete'] }),
  },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByText('This project did not open.')).toBeInTheDocument()
  },
}

export const NoDrawing: Story = {
  args: { card: cardWith({ stateLines: [], preview: 'none' }) },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByRole('link', { name: 'Hubbard House' })).toBeInTheDocument()
    await expect(screen.queryByText('This project did not open.')).not.toBeInTheDocument()
  },
}
