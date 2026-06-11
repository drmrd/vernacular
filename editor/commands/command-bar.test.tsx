import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommandBar } from './command-bar'
import { CommandPaletteProvider } from './command-context'
import {
  ActiveFloorProvider,
  EditorSessionProvider,
  SelectionProvider,
  createActiveFloorStore,
  createEditorSession,
  createSelectionStore,
} from '../../bridge'
import { addWall, createEmptyProject, createFloor, type Project } from '../../core'

function projectWithFloor(): Project {
  const project = createEmptyProject({
    name: 'Test',
    units: 'imperial',
    period: 'modern',
    appVersion: '0.0.0',
  })
  project.floors = [createFloor('Ground', { id: 'g' })]
  return project
}

function renderCommandBar() {
  const session = createEditorSession(projectWithFloor())
  const selection = createSelectionStore()
  const activeFloor = createActiveFloorStore('g')
  render(
    <EditorSessionProvider session={session}>
      <SelectionProvider store={selection}>
        <ActiveFloorProvider store={activeFloor}>
          <CommandPaletteProvider>
            <CommandBar />
          </CommandPaletteProvider>
        </ActiveFloorProvider>
      </SelectionProvider>
    </EditorSessionProvider>,
  )
  return { session, selection }
}

describe('CommandBar', () => {
  afterEach(() => {
    cleanup()
  })

  it('shows undo and redo controls and a palette opener', () => {
    renderCommandBar()

    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Redo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Command palette' })).toBeInTheDocument()
  })

  it('disables undo until there is history, then undoing reverts a wall', async () => {
    const { session } = renderCommandBar()

    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()

    await act(async () => {
      session.dispatch(addWall('g', { x: 0, y: 0 }, { x: 1000, y: 0 }))
    })

    expect(screen.getByRole('button', { name: 'Undo' })).not.toBeDisabled()
    expect(session.getSceneGraph().walls.length).toBe(1)

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    })

    expect(session.getSceneGraph().walls.length).toBe(0)
  })
})
