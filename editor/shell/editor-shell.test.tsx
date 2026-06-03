import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { EditorShell } from './editor-shell'
import { ActiveToolProvider } from '../tools/active-tool-provider'
import {
  EditorSessionProvider,
  SelectionProvider,
  createEditorSession,
  createSelectionStore,
} from '../../bridge'
import { createEmptyProject, createFloor, type Project } from '../../core'

function projectWithFloor(): Project {
  const project = createEmptyProject({
    name: 'Test',
    units: 'imperial',
    era: 'modern',
    appVersion: '0.0.0',
  })
  project.floors = [createFloor('Ground', { id: 'g' })]
  return project
}

function renderShell() {
  const session = createEditorSession(projectWithFloor())
  const selection = createSelectionStore()
  render(
    <EditorSessionProvider session={session}>
      <SelectionProvider store={selection}>
        <ActiveToolProvider>
          <EditorShell saveStatus="idle" />
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
})
