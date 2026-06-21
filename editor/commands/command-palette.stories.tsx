import { useMemo } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent } from 'storybook/test'
import {
  ActiveFloorProvider,
  EditorSessionProvider,
  SelectionProvider,
  createActiveFloorStore,
  createEditorSession,
  createSelectionStore,
} from '../../bridge'
import { createEmptyProject, createFloor } from '../../core'
import { ViewModeProvider } from '../viewport/view-mode'
import { SnapPreferencesProvider } from '../plan/snap-preferences-provider'
import { createSnapPreferencesStore } from '../plan/snap-preferences-store'
import { CommandPaletteProvider } from './command-context'
import { CommandBar } from './command-bar'
import { CommandPalette } from './command-palette'

const meta: Meta<typeof CommandPalette> = {
  title: 'Editor/CommandPalette',
  component: CommandPalette,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof CommandPalette>

const FLOOR_ID = 'ground'

// CommandPalette renders nothing until the palette context reports it open, so a
// bare render would leave the gate with an empty root. The harness mirrors the
// contexts the palette reads (editor session, selection, active floor, view
// mode, and snap preferences) and renders the bar beside it, whose Command
// palette button is the real opener. Each story opens the palette in its play
// step so the open, content-bearing dialog is what gets snapshotted.
function CommandPaletteHarness() {
  const session = useMemo(() => {
    const project = createEmptyProject({
      name: 'Sample plan',
      units: 'imperial',
      period: 'modern',
      appVersion: '0.0.0',
    })
    project.floors = [createFloor('Ground', { id: FLOOR_ID })]
    return createEditorSession(project)
  }, [])
  const selection = useMemo(() => createSelectionStore(), [])
  const activeFloor = useMemo(() => createActiveFloorStore(FLOOR_ID), [])
  const snapStore = useMemo(() => createSnapPreferencesStore(), [])

  return (
    <EditorSessionProvider session={session}>
      <SelectionProvider store={selection}>
        <ActiveFloorProvider store={activeFloor}>
          <ViewModeProvider>
            <SnapPreferencesProvider store={snapStore}>
              <CommandPaletteProvider>
                <CommandBar />
                <CommandPalette />
              </CommandPaletteProvider>
            </SnapPreferencesProvider>
          </ViewModeProvider>
        </ActiveFloorProvider>
      </SelectionProvider>
    </EditorSessionProvider>
  )
}

async function openPalette(canvasElement: HTMLElement): Promise<void> {
  const screen = within(canvasElement)
  await userEvent.click(screen.getByRole('button', { name: 'Command palette' }))
}

export const Open: Story = {
  render: () => <CommandPaletteHarness />,
  play: async ({ canvasElement }) => {
    await openPalette(canvasElement)
    const dialog = within(document.body).getByRole('dialog', { name: 'Command palette' })
    await expect(dialog).toBeInTheDocument()
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    const palette = within(dialog)
    await expect(palette.getByRole('textbox', { name: 'Search commands' })).toBeInTheDocument()
    await expect(palette.getByRole('button', { name: 'Command palette' })).toBeInTheDocument()
  },
}

export const FilteringCommands: Story = {
  render: () => <CommandPaletteHarness />,
  play: async ({ canvasElement }) => {
    await openPalette(canvasElement)
    const dialog = within(document.body).getByRole('dialog', { name: 'Command palette' })
    const palette = within(dialog)
    await userEvent.type(palette.getByRole('textbox', { name: 'Search commands' }), 'radius')
    await expect(palette.getByRole('button', { name: 'Increase snap radius' })).toBeInTheDocument()
    await expect(palette.getByRole('button', { name: 'Decrease snap radius' })).toBeInTheDocument()
    await expect(palette.queryByRole('button', { name: 'Undo' })).toBeNull()
  },
}
