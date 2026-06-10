import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditorShell, type EditorShellProps } from './editor-shell'
import { ActiveToolProvider } from '../tools/active-tool-provider'
import {
  EditorSessionProvider,
  SelectionProvider,
  createEditorSession,
  createSelectionStore,
} from '../../bridge'
import { createEmptyProject, createFloor, type Project } from '../../core'
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
  render(
    <EditorSessionProvider session={session}>
      <SelectionProvider store={selection}>
        <ActiveToolProvider>
          <EditorShell saveStatus="idle" {...props} />
        </ActiveToolProvider>
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

  it('renders labeled toolbar, tools, viewport, 3D preview, and inspector regions', () => {
    vi.stubGlobal('navigator', {})

    renderShell()

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: /vernacular/i })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: /tools/i })).toBeInTheDocument()
    expect(screen.getByRole('main', { name: /viewport/i })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /3d preview/i })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: /inspector/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/floor plan/i)).toBeInTheDocument()
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
