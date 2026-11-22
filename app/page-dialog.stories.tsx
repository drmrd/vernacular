import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, fn } from 'storybook/test'
import { createEmptyProject } from '../core'
import { PageDialog } from './page-dialog'
import type { FailedOpenDialogState } from './use-failed-open-dialog'

const DETAILS = {
  error: 'The document breaks the format rules at 1 place.',
  faults: [{ path: '/floors/0/x-old', message: 'The field is not defined.' }],
  formatVersion: 17,
  build: '0.3.0',
  removedPaths: [],
}

const REPAIR = {
  document: createEmptyProject({
    name: 'Repaired house',
    units: 'imperial',
    period: 'victorian',
    appVersion: '0.3.0',
  }),
  sentences: ['It removes the extra data from 2 paint entries.'],
  removedPaths: [],
}

function failedOpenState(changes: Partial<FailedOpenDialogState>): FailedOpenDialogState {
  return {
    shown: {
      source: 'stored',
      id: 'house',
      model: { cause: 'format-rules', details: DETAILS, repair: REPAIR },
    },
    choice: {
      choosing: false,
      busy: false,
      start: fn(),
      cancel: fn(),
      openAsNew: fn(),
      replace: fn(),
    },
    onClose: fn(),
    takesNotice: true,
    onRefusedFile: fn(),
    clearFile: fn(),
    ...changes,
  }
}

const meta: Meta<typeof PageDialog> = {
  title: 'App/PageDialog',
  component: PageDialog,
  tags: ['autodocs'],
  args: { failedOpen: failedOpenState({}), onOpen: fn(), onExport: fn() },
  decorators: [
    (story) => (
      // A transform makes this wrapper the containing block of the viewport-pinned backdrop.
      <div style={{ height: '24rem', transform: 'translate(0)' }}>{story()}</div>
    ),
  ],
}

export default meta

type Story = StoryObj<typeof PageDialog>

export const StoredProjectFailedToOpen: Story = {
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(
      screen.getByRole('alertdialog', { name: 'This project did not open.' }),
    ).toBeVisible()
    await expect(screen.getByRole('button', { name: 'Open with the repair' })).toBeVisible()
    await expect(screen.getByRole('button', { name: 'Export' })).toBeVisible()
  },
}

export const FileFailedToOpen: Story = {
  args: {
    failedOpen: failedOpenState({
      shown: {
        source: 'file',
        file: undefined,
        model: { cause: 'file-too-large', details: { ...DETAILS, faults: [] } },
      },
    }),
  },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByRole('alertdialog', { name: 'This file did not open.' })).toBeVisible()
    await expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    await expect(screen.queryByRole('button', { name: 'Export' })).toBeNull()
  },
}

export const ChoosingARepair: Story = {
  args: {
    failedOpen: failedOpenState({
      choice: {
        choosing: true,
        busy: false,
        start: fn(),
        cancel: fn(),
        openAsNew: fn(),
        replace: fn(),
      },
    }),
  },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(
      screen.getByRole('alertdialog', { name: 'Open the repaired project' }),
    ).toBeVisible()
    await expect(screen.getByRole('button', { name: 'Open as a new project' })).toBeVisible()
  },
}
