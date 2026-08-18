import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  ActiveFloorProvider,
  EditorSessionProvider,
  SelectionProvider,
  createActiveFloorStore,
  createEditorSession,
  createSelectionStore,
  useActiveFloorId,
  useEditorSession,
  useSceneGraph,
  useSelection,
} from '../../bridge'
import { createEmptyProject, createFloor } from '../../core'
import { ViewModeProvider, useViewMode } from '../viewport/view-mode'
import { SnapPreferencesProvider } from '../plan/snap-preferences-provider'
import { createSnapPreferencesStore } from '../plan/snap-preferences-store'
import { useSnapPreferencesStore } from '../plan/snap-preferences-context'
import { CommandPalette, CommandPaletteDialog } from './command-palette'
import { CommandPaletteProvider, useCommandPalette } from './command-context'
import { createCommandSet } from './command-set'
import { useKeybindings } from './use-keybindings'
import type { CommandContext, EditorCommand } from './command'

afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
})

const context = {} as CommandContext
const runUndo = vi.fn()
const runRedo = vi.fn()

function buildCommands(): EditorCommand[] {
  return [
    { id: 'undo', label: 'Undo', keybindings: [], isEnabled: () => true, run: runUndo },
    { id: 'redo', label: 'Redo', keybindings: [], isEnabled: () => true, run: runRedo },
    {
      id: 'delete',
      label: 'Delete selection',
      keybindings: [],
      isEnabled: () => false,
      run: vi.fn(),
    },
  ]
}

function renderDialog(onClose: () => void) {
  render(<CommandPaletteDialog commands={buildCommands()} context={context} onClose={onClose} />)
}

describe('CommandPaletteDialog', () => {
  it('lists only the enabled commands', () => {
    renderDialog(vi.fn())

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Undo')).toBeInTheDocument()
    expect(screen.getByText('Redo')).toBeInTheDocument()
    expect(screen.queryByText('Delete selection')).toBeNull()
  })

  it('filters the commands by the typed query', async () => {
    renderDialog(vi.fn())

    await userEvent.type(screen.getByRole('textbox'), 'red')

    expect(screen.getByText('Redo')).toBeInTheDocument()
    expect(screen.queryByText('Undo')).toBeNull()
  })

  it('runs the first filtered command on Enter and closes', async () => {
    const onClose = vi.fn()
    renderDialog(onClose)

    await userEvent.type(screen.getByRole('textbox'), 'red')
    await userEvent.keyboard('{Enter}')

    expect(runRedo).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('runs a command when clicked and closes', async () => {
    const onClose = vi.fn()
    renderDialog(onClose)

    await userEvent.click(screen.getByText('Undo'))

    expect(runUndo).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders each command row through the design-system Button primitive and still runs it on click', async () => {
    const onClose = vi.fn()
    renderDialog(onClose)

    const undoRow = screen.getByRole('button', { name: 'Undo' })
    const redoRow = screen.getByRole('button', { name: 'Redo' })

    expect(undoRow).toHaveClass('ds-button')
    expect(redoRow).toHaveClass('ds-button')

    await userEvent.click(undoRow)

    expect(runUndo).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    renderDialog(onClose)

    screen.getByRole('textbox').focus()
    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalled()
  })

  it('focuses the search input on open and restores focus to the opener on Escape', async () => {
    const opener = document.createElement('button')
    opener.textContent = 'Open palette'
    document.body.appendChild(opener)
    opener.focus()
    expect(document.activeElement).toBe(opener)

    try {
      const onClose = vi.fn()
      renderDialog(onClose)

      expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Search commands' }))

      await userEvent.keyboard('{Escape}')

      expect(onClose).toHaveBeenCalled()
      expect(document.activeElement).toBe(opener)
    } finally {
      opener.remove()
    }
  })

  it('does not leak handled keystrokes to the window', () => {
    const onWindowKeyDown = vi.fn()
    window.addEventListener('keydown', onWindowKeyDown)

    try {
      renderDialog(vi.fn())

      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })

      expect(onWindowKeyDown).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('keydown', onWindowKeyDown)
    }
  })
})

describe('the palette dialog surface', () => {
  it('exposes the open palette as a named modal dialog', () => {
    renderDialog(vi.fn())

    const dialog = screen.getByRole('dialog', { name: 'Command palette' })

    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('labels the search input for assistive tech', () => {
    renderDialog(vi.fn())

    expect(screen.getByRole('textbox', { name: 'Search commands' })).toBeInTheDocument()
  })

  it('traps Tab focus within the open dialog, wrapping between the last result and the search input', async () => {
    renderDialog(vi.fn())

    const dialog = screen.getByRole('dialog', { name: 'Command palette' })
    const searchInput = screen.getByRole('textbox', { name: 'Search commands' })
    const lastResult = screen.getByRole('button', { name: 'Redo' })

    lastResult.focus()
    expect(document.activeElement).toBe(lastResult)
    expect(dialog.contains(document.activeElement)).toBe(true)

    await userEvent.tab()

    expect(document.activeElement).toBe(searchInput)
    expect(dialog.contains(document.activeElement)).toBe(true)

    await userEvent.tab({ shift: true })

    expect(document.activeElement).toBe(lastResult)
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('dresses the dialog, search input, and result rows in the design-system surface classes', () => {
    renderDialog(vi.fn())

    const dialog = screen.getByRole('dialog', { name: 'Command palette' })
    const surface =
      dialog.classList.contains('ds-menu-surface') ||
      dialog.classList.contains('command-palette__panel')
        ? dialog
        : dialog.querySelector('.ds-menu-surface, .command-palette__panel')
    expect(surface).not.toBeNull()

    const searchInput = screen.getByRole('textbox', { name: 'Search commands' })
    const fieldDressed =
      searchInput.classList.contains('ds-field__control') ||
      searchInput.closest('.ds-field') !== null
    expect(fieldDressed).toBe(true)

    const undoRow = screen.getByRole('button', { name: 'Undo' })
    const redoRow = screen.getByRole('button', { name: 'Redo' })

    expect(undoRow).toHaveClass('ds-button')
    expect(undoRow).toHaveClass('ds-menu-surface__row')
    expect(redoRow).toHaveClass('ds-button')
    expect(redoRow).toHaveClass('ds-menu-surface__row')
  })
})

describe('the palette command rows', () => {
  function bindableCommands(): EditorCommand[] {
    return [
      { id: 'undo', label: 'Undo', keybindings: ['Mod+Z'], isEnabled: () => true, run: vi.fn() },
      {
        id: 'redo',
        label: 'Redo',
        keybindings: ['Mod+Shift+Z', 'Mod+Y'],
        isEnabled: () => true,
        run: vi.fn(),
      },
      {
        id: 'toggle-snap-edge',
        label: 'Toggle edge snap',
        keybindings: [],
        isEnabled: () => true,
        run: vi.fn(),
      },
    ]
  }

  function renderRows() {
    render(
      <CommandPaletteDialog commands={bindableCommands()} context={context} onClose={vi.fn()} />,
    )
  }

  it('leaves the palette opener out of the palette it already opened', () => {
    const commands: EditorCommand[] = [
      { id: 'undo', label: 'Undo', keybindings: ['Mod+Z'], isEnabled: () => true, run: vi.fn() },
      {
        id: 'open-command-palette',
        label: 'Command palette',
        keybindings: ['Mod+K'],
        isEnabled: () => true,
        run: vi.fn(),
      },
    ]
    render(<CommandPaletteDialog commands={commands} context={context} onClose={vi.fn()} />)

    expect(screen.getByText('Undo')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Command palette/ })).toBeNull()
  })

  it('prints the first binding of a command beside its name', () => {
    renderRows()

    const redo = screen.getByRole('button', { name: 'Redo' })

    expect(redo).toHaveTextContent('Ctrl+Shift+Z')
    expect(redo).toHaveAttribute('aria-keyshortcuts', 'Ctrl+Shift+Z')
  })

  it('says nothing about a shortcut for a command that has none', () => {
    renderRows()

    const row = screen.getByRole('button', { name: 'Toggle edge snap' })

    expect(row).not.toHaveAttribute('aria-keyshortcuts')
    expect(row).toHaveTextContent('Toggle edge snap')
  })

  it('finds a command by the shortcut printed on it, not only by its name', async () => {
    renderRows()

    await userEvent.type(screen.getByRole('textbox'), 'ctrl+shift')

    expect(screen.getByText('Redo')).toBeInTheDocument()
    expect(screen.queryByText('Undo')).toBeNull()
  })
})

// The palette should list exactly what the keys run, so nothing can drift between
// the two. Save is the proof: it only exists when the editor can save, so it is
// registered by the layer that owns the keys rather than assembled by the palette.
function PaletteHarness({ onSave }: { onSave?: (() => void) | undefined }) {
  const session = useEditorSession()
  const selection = useSelection()
  const activeFloorId = useActiveFloorId()
  const graph = useSceneGraph()
  const palette = useCommandPalette()
  const view = useViewMode()
  const snapStore = useSnapPreferencesStore()
  const commands = createCommandSet({ view, snapStore, onSave })
  useKeybindings(commands, {
    session,
    selection,
    graph,
    activeFloorId,
    openPalette: palette.open,
  })
  return (
    <>
      <button type="button" onClick={palette.open}>
        Open the palette
      </button>
      <CommandPalette />
    </>
  )
}

function renderPalette(onSave?: () => void) {
  const session = createEditorSession(paletteProject())
  render(
    <EditorSessionProvider session={session}>
      <SelectionProvider store={createSelectionStore()}>
        <ActiveFloorProvider store={createActiveFloorStore('ground')}>
          <ViewModeProvider>
            <SnapPreferencesProvider store={createSnapPreferencesStore()}>
              <CommandPaletteProvider>
                <PaletteHarness onSave={onSave} />
              </CommandPaletteProvider>
            </SnapPreferencesProvider>
          </ViewModeProvider>
        </ActiveFloorProvider>
      </SelectionProvider>
    </EditorSessionProvider>,
  )
}

function paletteProject() {
  const project = createEmptyProject({
    name: 'Test',
    units: 'metric',
    period: 'modern',
    appVersion: '0.0.0',
  })
  project.floors = [createFloor('Ground', { id: 'ground' })]
  return project
}

describe('CommandPalette', () => {
  it('lists what the keybinding layer registered, Save included', async () => {
    renderPalette(vi.fn())

    await userEvent.click(screen.getByRole('button', { name: 'Open the palette' }))

    const dialog = screen.getByRole('dialog', { name: 'Command palette' })
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('offers no Save when the editor has no way to save', async () => {
    renderPalette()

    await userEvent.click(screen.getByRole('button', { name: 'Open the palette' }))

    const dialog = screen.getByRole('dialog', { name: 'Command palette' })
    expect(within(dialog).queryByRole('button', { name: 'Save' })).toBeNull()
  })
})
