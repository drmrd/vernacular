import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import {
  EditorSessionProvider,
  SelectionProvider,
  ActiveFloorProvider,
  createEditorSession,
  createSelectionStore,
  createActiveFloorStore,
} from '../../bridge'
import { createEmptyProject, createFloor } from '../../core'
import { Inspector } from './inspector'

afterEach(cleanup)

function renderInspector() {
  const project = createEmptyProject({
    name: 'T',
    units: 'imperial',
    period: 'modern',
    appVersion: '0.0.0',
  })
  project.floors = [createFloor('G', { id: 'g' })]
  const session = createEditorSession(project)
  const selection = createSelectionStore()
  const activeFloor = createActiveFloorStore('g')
  render(
    <EditorSessionProvider session={session}>
      <SelectionProvider store={selection}>
        <ActiveFloorProvider store={activeFloor}>
          <Inspector />
        </ActiveFloorProvider>
      </SelectionProvider>
    </EditorSessionProvider>,
  )
  return { selection }
}

describe('Inspector', () => {
  it('renders a PROPERTIES heading', () => {
    renderInspector()
    expect(screen.getByRole('heading', { name: /properties/i })).toBeInTheDocument()
  })

  it('shows no selection count badge when nothing is selected', () => {
    renderInspector()
    expect(screen.queryByText(/selected/i)).toBeNull()
  })

  it('shows a "1 selected" badge when one entity is selected', () => {
    const { selection } = renderInspector()
    act(() => {
      selection.select('wall:w1')
    })
    expect(screen.getByText('1 selected')).toBeInTheDocument()
  })

  it('shows "2 selected" when two entities are selected', () => {
    const { selection } = renderInspector()
    act(() => {
      selection.setSelection(['wall:w1', 'wall:w2'])
    })
    expect(screen.getByText('2 selected')).toBeInTheDocument()
  })

  it('shows a Wall component title in EB Garamond when a wall is selected', () => {
    const { selection } = renderInspector()
    act(() => {
      selection.select('wall:w1')
    })
    const title = screen.getByRole('heading', { level: 3 })
    expect(title).toHaveTextContent(/wall/i)
    expect(title).toHaveClass('inspector__component-title')
  })

  it('shows no component title when nothing is selected', () => {
    renderInspector()
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull()
  })

  it('shows no component title when two entities are selected', () => {
    const { selection } = renderInspector()
    act(() => {
      selection.setSelection(['wall:w1', 'wall:w2'])
    })
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull()
  })
})
