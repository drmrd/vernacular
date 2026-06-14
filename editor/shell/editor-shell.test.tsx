import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditorShell, type EditorShellProps } from './editor-shell'
import { ActiveToolProvider } from '../tools/active-tool-provider'
import {
  ActiveFloorProvider,
  EditorSessionProvider,
  SelectionProvider,
  createActiveFloorStore,
  createEditorSession,
  createSelectionStore,
} from '../../bridge'
import { createEmptyProject, createFloor, type Project } from '../../core'
import { PAINT_PICKER_SLOT, PAINT_INSPECTOR_SLOT } from './shell-panel-slots'

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

function renderShell(props: Partial<EditorShellProps> = {}) {
  const session = createEditorSession(projectWithFloor())
  const selection = createSelectionStore()
  const activeFloor = createActiveFloorStore(session.getProject().floors[0]?.id ?? null)
  render(
    <EditorSessionProvider session={session}>
      <SelectionProvider store={selection}>
        <ActiveFloorProvider store={activeFloor}>
          <ActiveToolProvider>
            <EditorShell saveStatus="idle" {...props} />
          </ActiveToolProvider>
        </ActiveFloorProvider>
      </SelectionProvider>
    </EditorSessionProvider>,
  )
  return { session, selection }
}

describe('EditorShell', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('renders labeled toolbar, tools, viewport, and inspector regions', () => {
    vi.stubGlobal('navigator', {})

    renderShell()

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: /vernacular/i })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: /tools/i })).toBeInTheDocument()
    expect(screen.getByRole('main', { name: /viewport/i })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: /inspector/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/floor plan/i)).toBeInTheDocument()
  })

  it('reveals the 3D preview when the 3D view mode is selected', async () => {
    vi.stubGlobal('navigator', {})
    const user = userEvent.setup()

    renderShell()

    expect(screen.queryByRole('region', { name: /3d preview/i })).toBeNull()

    await user.click(screen.getByRole('button', { name: '3D view' }))

    expect(screen.getByRole('region', { name: /3d preview/i })).toBeInTheDocument()
  })

  it('renders a primary Export button in the toolbar', () => {
    vi.stubGlobal('navigator', {})

    renderShell({ onExportBundle: vi.fn() })

    const exportBtn = screen.getByRole('button', { name: /^export$/i })
    expect(exportBtn).toHaveClass('ds-button--primary')
  })

  it('renders Undo and Redo buttons in the toolbar', () => {
    vi.stubGlobal('navigator', {})

    renderShell()

    expect(screen.queryAllByRole('button', { name: /undo/i }).length).toBeGreaterThan(0)
    expect(screen.queryAllByRole('button', { name: /redo/i }).length).toBeGreaterThan(0)
  })

  it('renders Grid and Dimensions toggle buttons in the toolbar', () => {
    vi.stubGlobal('navigator', {})

    renderShell()

    expect(screen.getByRole('button', { name: /grid/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dimensions/i })).toBeInTheDocument()
  })

  it('toggles the Grid button aria-pressed on click', async () => {
    vi.stubGlobal('navigator', {})
    const user = userEvent.setup()

    renderShell()

    const gridBtn = screen.getByRole('button', { name: /grid/i })
    expect(gridBtn).toHaveAttribute('aria-pressed', 'true')

    await user.click(gridBtn)
    expect(gridBtn).toHaveAttribute('aria-pressed', 'false')
  })

  it('no longer shows the dev wall-count paragraph in the toolbar', () => {
    vi.stubGlobal('navigator', {})

    renderShell()

    expect(screen.queryByText(/walls:/i)).toBeNull()
  })

  it('shows the selected state in the inspector', () => {
    vi.stubGlobal('navigator', {})

    const { selection } = renderShell()
    act(() => {
      selection.select('wall:a')
    })

    expect(screen.getByText(/wall selected/i)).toBeInTheDocument()
  })

  it('invokes the new, save, and export handlers when their buttons are clicked', async () => {
    vi.stubGlobal('navigator', {})
    const onNewProject = vi.fn()
    const onSave = vi.fn()
    const onExportBundle = vi.fn()
    const user = userEvent.setup()

    renderShell({ onNewProject, onSave, onExportBundle })

    const project = screen.getByRole('navigation', { name: /project/i })
    await user.click(within(project).getByRole('button', { name: /^new$/i }))
    await user.click(within(project).getByRole('button', { name: /^save$/i }))
    await user.click(within(project).getByRole('button', { name: /export bundle/i }))

    expect(onNewProject).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onExportBundle).toHaveBeenCalledTimes(1)
  })

  it('invokes the open-folder handler when its button is clicked', async () => {
    vi.stubGlobal('navigator', {})
    const onOpenFolder = vi.fn()
    const user = userEvent.setup()

    renderShell({ onOpenFolder })

    const project = screen.getByRole('navigation', { name: /project/i })
    await user.click(within(project).getByRole('button', { name: /open folder/i }))

    expect(onOpenFolder).toHaveBeenCalledTimes(1)
  })

  it('opens a recent project by its id when its control is clicked', async () => {
    vi.stubGlobal('navigator', {})
    const onOpenRecent = vi.fn()
    const user = userEvent.setup()

    renderShell({
      recentProjects: [
        { id: 'a', name: 'Alpha' },
        { id: 'b', name: 'Beta' },
      ],
      onOpenRecent,
    })

    expect(screen.getByRole('button', { name: /alpha/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /beta/i }))

    expect(onOpenRecent).toHaveBeenCalledTimes(1)
    expect(onOpenRecent).toHaveBeenCalledWith('b')
  })

  it('restores or discards from the recovery prompt and hides it otherwise', async () => {
    vi.stubGlobal('navigator', {})
    const onRestore = vi.fn()
    const onDiscard = vi.fn()
    const user = userEvent.setup()

    renderShell({ recovery: { onRestore, onDiscard } })

    const alert = screen.getByRole('alert')
    await user.click(within(alert).getByRole('button', { name: /restore/i }))
    await user.click(within(alert).getByRole('button', { name: /discard/i }))

    expect(onRestore).toHaveBeenCalledTimes(1)
    expect(onDiscard).toHaveBeenCalledTimes(1)

    cleanup()
    renderShell()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: /restore/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /discard/i })).toBeNull()
  })

  it('hides project controls, the recent list, and the recovery prompt when no handlers are provided', () => {
    vi.stubGlobal('navigator', {})

    renderShell()

    expect(screen.queryByRole('button', { name: /^new$/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^save$/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /export bundle/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /open folder/i })).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('lays out the shell in the application frame with empty sibling panel slots', () => {
    vi.stubGlobal('navigator', {})

    renderShell()

    expect(screen.getByRole('complementary', { name: /tool rail/i })).toBeInTheDocument()
    expect(screen.getByRole('main', { name: /viewport/i })).toBeInTheDocument()

    // The always-on global paint list is gone; the inspector swaps by selection.
    expect(document.querySelector(`[data-slot-id="${PAINT_PICKER_SLOT}"]`)).toBeNull()
    expect(document.querySelector(`[data-slot-id="${PAINT_INSPECTOR_SLOT}"]`)).not.toBeNull()

    expect(screen.getByRole('navigation', { name: /tools/i })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: /floors/i })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: /inspector/i })).toBeInTheDocument()
  })
})
