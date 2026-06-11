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
import { createEmptyProject, createFloor, createWall, type Project } from '../../core'
import { FLOOR_SWITCHER_SLOT, PAINT_PICKER_SLOT, PAINT_INSPECTOR_SLOT } from './shell-panel-slots'

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

function twoFloorProject(): Project {
  const project = createEmptyProject({
    name: 'Test',
    units: 'imperial',
    period: 'modern',
    appVersion: '0.0.0',
  })
  project.floors = [
    createFloor('Ground', {
      id: 'g',
      walls: [createWall({ x: 0, y: 0 }, { x: 1000, y: 0 }, { id: 'w1' })],
    }),
    createFloor('Upper', { id: 'u' }),
  ]
  return project
}

function renderShellWithProject(project: Project, initialFloorId: string) {
  const session = createEditorSession(project)
  const selection = createSelectionStore()
  const activeFloor = createActiveFloorStore(initialFloorId)
  render(
    <EditorSessionProvider session={session}>
      <SelectionProvider store={selection}>
        <ActiveFloorProvider store={activeFloor}>
          <ActiveToolProvider>
            <EditorShell saveStatus="idle" />
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

  it('shows a live wall count and the empty selection state', () => {
    vi.stubGlobal('navigator', {})

    renderShell()

    expect(screen.getByText(/walls: 0/i)).toBeInTheDocument()
    expect(screen.getByText(/no selection/i)).toBeInTheDocument()
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

  it('mounts the Paint panel and binds the picker to a chosen surface', async () => {
    vi.stubGlobal('navigator', {})
    const user = userEvent.setup()

    renderShell()

    expect(screen.getByRole('button', { name: 'Floor' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ceiling' })).toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Floor' }))

    expect(screen.getByRole('searchbox')).toBeInTheDocument()
  })

  it('lays out the shell in the application frame with empty sibling panel slots', () => {
    vi.stubGlobal('navigator', {})

    renderShell()

    expect(screen.getByRole('complementary', { name: /tool rail/i })).toBeInTheDocument()
    expect(screen.getByRole('main', { name: /viewport/i })).toBeInTheDocument()

    const slotIds = [FLOOR_SWITCHER_SLOT, PAINT_PICKER_SLOT, PAINT_INSPECTOR_SLOT]
    for (const slotId of slotIds) {
      expect(document.querySelector(`[data-slot-id="${slotId}"]`)).not.toBeNull()
    }

    expect(screen.getByRole('navigation', { name: /tools/i })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: /inspector/i })).toBeInTheDocument()
  })
})

describe('EditorShell header wall count', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("shows the active floor's wall count and updates on floor switch", async () => {
    vi.stubGlobal('navigator', {})
    const user = userEvent.setup()

    renderShellWithProject(twoFloorProject(), 'g')

    expect(screen.getByText(/walls: 1/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Upper' }))
    expect(screen.getByText(/walls: 0/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ground' }))
    expect(screen.getByText(/walls: 1/i)).toBeInTheDocument()
  })
})
