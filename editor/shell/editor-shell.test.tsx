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
import { ThemeProvider } from '../design-system'
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
    <ThemeProvider>
      <EditorSessionProvider session={session}>
        <SelectionProvider store={selection}>
          <ActiveFloorProvider store={activeFloor}>
            <ActiveToolProvider>
              <EditorShell saveStatus="idle" {...props} />
            </ActiveToolProvider>
          </ActiveFloorProvider>
        </SelectionProvider>
      </EditorSessionProvider>
    </ThemeProvider>,
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

  it('renders the brand mark beside the wordmark', () => {
    vi.stubGlobal('navigator', {})

    renderShell()

    const banner = screen.getByRole('banner')
    expect(within(banner).getByRole('img', { name: /vernacular/i })).toBeInTheDocument()
  })

  it('shows only the current project name in the breadcrumb', () => {
    vi.stubGlobal('navigator', {})

    renderShell()

    const breadcrumb = screen.getByRole('navigation', { name: /breadcrumb/i })

    // The single-project model has no projects list, so the false "My Projects"
    // parent crumb and the leading separator are gone.
    expect(within(breadcrumb).queryByText(/my projects/i)).not.toBeInTheDocument()
    expect(within(breadcrumb).getByText('Test')).toBeInTheDocument()
    expect(breadcrumb.textContent?.startsWith('/')).toBe(false)
    expect(breadcrumb.textContent).toContain('Test')
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

  it('renders single Undo and Redo buttons and no command-palette button in the toolbar', () => {
    vi.stubGlobal('navigator', {})

    renderShell()

    expect(screen.queryAllByRole('button', { name: /undo/i })).toHaveLength(1)
    expect(screen.queryAllByRole('button', { name: /redo/i })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /command palette/i })).toBeNull()
  })

  it('renders a theme toggle in the toolbar', () => {
    vi.stubGlobal('navigator', {})

    renderShell()

    const themeGroup = screen.getByRole('group', { name: /theme/i })
    expect(themeGroup).toBeInTheDocument()
    expect(within(themeGroup).getByRole('button', { name: /system/i })).toBeInTheDocument()
  })

  it('renders Grid and Dimensions toggle buttons in the toolbar', () => {
    vi.stubGlobal('navigator', {})

    renderShell()

    expect(screen.getByRole('button', { name: /grid/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dimensions/i })).toBeInTheDocument()
  })

  it('shows visible text labels on the Grid and Dimensions toggles', () => {
    vi.stubGlobal('navigator', {})

    renderShell()

    expect(
      within(screen.getByRole('button', { name: /grid/i })).getByText('Grid'),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('button', { name: /dimensions/i })).getByText('Dimensions'),
    ).toBeInTheDocument()
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

  it('routes the Grid, Dimensions, Undo, and Redo header buttons through the IconButton primitive', async () => {
    vi.stubGlobal('navigator', {})
    const user = userEvent.setup()

    renderShell()

    const gridBtn = screen.getByRole('button', { name: /grid/i })
    const dimensionsBtn = screen.getByRole('button', { name: /dimensions/i })
    const undoBtn = screen.getByRole('button', { name: /undo/i })
    const redoBtn = screen.getByRole('button', { name: /redo/i })

    // Migrated to the design-system IconButton primitive (ds-icon-button), not the
    // retired hand-rolled editor-shell__icon-btn idiom.
    expect(gridBtn).toHaveClass('ds-icon-button')
    expect(dimensionsBtn).toHaveClass('ds-icon-button')
    expect(undoBtn).toHaveClass('ds-icon-button')
    expect(redoBtn).toHaveClass('ds-icon-button')
    expect(gridBtn).not.toHaveClass('editor-shell__icon-btn')

    // The labeled toggles keep their visible text label after migration.
    expect(within(gridBtn).getByText('Grid')).toBeInTheDocument()
    expect(within(dimensionsBtn).getByText('Dimensions')).toBeInTheDocument()

    // Behavior is preserved: the Grid toggle still flips aria-pressed on click.
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

    // The selection surfaces as the Wall component title and the count badge, not a
    // placeholder body string.
    expect(screen.getByRole('heading', { level: 3, name: /wall/i })).toBeInTheDocument()
    expect(screen.getByText('1 selected')).toBeInTheDocument()
  })

  it('shows the active tool in the status bar', () => {
    vi.stubGlobal('navigator', {})

    renderShell()

    expect(screen.getByText(/tool: select/i)).toBeInTheDocument()
  })

  it('invokes the new, save, and export handlers when their controls are used', async () => {
    vi.stubGlobal('navigator', {})
    const onNewProject = vi.fn()
    const onSave = vi.fn()
    const onExportBundle = vi.fn()
    const user = userEvent.setup()

    renderShell({ onNewProject, onSave, onExportBundle })

    // New lives in the project menu near the wordmark; Save stays a visible action.
    await user.click(screen.getByRole('button', { name: /project/i }))
    await user.click(screen.getByRole('menuitem', { name: /new project/i }))
    const project = screen.getByRole('navigation', { name: /project/i })
    await user.click(within(project).getByRole('button', { name: /^save$/i }))
    await user.click(screen.getByRole('button', { name: /^export$/i }))
    await user.click(screen.getByRole('menuitem', { name: /bundle/i }))

    expect(onNewProject).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onExportBundle).toHaveBeenCalledTimes(1)
  })

  it('invokes the open-folder handler from the project menu', async () => {
    vi.stubGlobal('navigator', {})
    const onOpenFolder = vi.fn()
    const user = userEvent.setup()

    renderShell({ onOpenFolder })

    await user.click(screen.getByRole('button', { name: /project/i }))
    await user.click(screen.getByRole('menuitem', { name: /open folder/i }))

    expect(onOpenFolder).toHaveBeenCalledTimes(1)
  })

  it('opens a recent project by its id from the project menu', async () => {
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

    await user.click(screen.getByRole('button', { name: /project/i }))
    expect(screen.getByRole('menuitem', { name: /alpha/i })).toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: /beta/i }))

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

  it('shows the open-file menu item, the import alert, and a viewport drop target', async () => {
    vi.stubGlobal('navigator', {})
    const user = userEvent.setup()

    renderShell({
      onNewProject: vi.fn(),
      onOpenFile: vi.fn(),
      onImportDroppedFile: vi.fn(),
      importStatus: { fileName: 'x.building', reason: 'corrupt' },
    })

    await user.click(screen.getByRole('button', { name: /project/i }))
    expect(screen.getByRole('menuitem', { name: /open file/i })).toBeInTheDocument()

    expect(screen.getByRole('alert')).toHaveTextContent(/x\.building/)
    expect(screen.getByTestId('import-drop-target')).toBeInTheDocument()
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

  it('no longer anchors the underlay controls to the plan canvas', () => {
    vi.stubGlobal('navigator', {})

    renderShell()

    // The underlay controls moved off the canvas into the tool-rail launcher, so
    // the canvas-anchored Trace underlay checkbox and the always-visible Load
    // image button are gone from the shell.
    expect(screen.queryByRole('checkbox', { name: /trace underlay/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /load image/i })).toBeNull()
  })

  it('lays out the shell regions without a global paint slot', () => {
    vi.stubGlobal('navigator', {})

    renderShell()

    expect(screen.getByRole('complementary', { name: /tool rail/i })).toBeInTheDocument()
    expect(screen.getByRole('main', { name: /viewport/i })).toBeInTheDocument()

    // The always-on global paint list is gone; the inspector swaps by selection,
    // so neither the paint-picker nor the paint-inspector slot mounts.
    expect(document.querySelector(`[data-slot-id="${PAINT_PICKER_SLOT}"]`)).toBeNull()
    expect(document.querySelector(`[data-slot-id="${PAINT_INSPECTOR_SLOT}"]`)).toBeNull()

    expect(screen.getByRole('navigation', { name: /tools/i })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: /floors/i })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: /inspector/i })).toBeInTheDocument()
  })
})
