import { useMemo, type ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect } from 'storybook/test'
import {
  ActiveFloorProvider,
  EditorSessionProvider,
  SelectionProvider,
  createActiveFloorStore,
  createEditorSession,
  createSelectionStore,
} from '../../bridge'
import { addWall, createEmptyProject, createFloor } from '../../core'
import { CommandPaletteProvider } from './command-context'
import { CommandBar } from './command-bar'

const meta: Meta<typeof CommandBar> = {
  title: 'Editor/CommandBar',
  component: CommandBar,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof CommandBar>

const FLOOR_ID = 'ground'

interface CommandBarHarnessProps {
  withHistory?: boolean
  children?: ReactNode
}

// Mirrors command-bar.test.tsx renderCommandBar: a project with one floor fed
// through the editor-session, selection, active-floor, and command-palette
// providers. The bar always renders its Undo, Redo, and Command palette
// controls, so the visual gate has content to snapshot. The optional history
// flag dispatches a wall so Undo is enabled.
function CommandBarHarness({ withHistory = false }: CommandBarHarnessProps) {
  const session = useMemo(() => {
    const project = createEmptyProject({
      name: 'Sample plan',
      units: 'imperial',
      period: 'modern',
      appVersion: '0.0.0',
    })
    project.floors = [createFloor('Ground', { id: FLOOR_ID })]
    const editorSession = createEditorSession(project)
    if (withHistory) {
      editorSession.dispatch(addWall(FLOOR_ID, { x: 0, y: 0 }, { x: 1000, y: 0 }))
    }
    return editorSession
  }, [withHistory])
  const selection = useMemo(() => createSelectionStore(), [])
  const activeFloor = useMemo(() => createActiveFloorStore(FLOOR_ID), [])

  return (
    <EditorSessionProvider session={session}>
      <SelectionProvider store={selection}>
        <ActiveFloorProvider store={activeFloor}>
          <CommandPaletteProvider>
            <CommandBar />
          </CommandPaletteProvider>
        </ActiveFloorProvider>
      </SelectionProvider>
    </EditorSessionProvider>
  )
}

export const EmptyHistory: Story = {
  render: () => <CommandBarHarness />,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
    await expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled()
    await expect(screen.getByRole('button', { name: 'Command palette' })).toBeInTheDocument()
  },
}

export const WithHistory: Story = {
  render: () => <CommandBarHarness withHistory />,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByRole('button', { name: 'Undo' })).not.toBeDisabled()
    await expect(screen.getByRole('button', { name: 'Command palette' })).toBeInTheDocument()
  },
}
