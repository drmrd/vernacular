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
import { createEmptyProject, createFloor, createWall } from '../../core'
import { Inspector, PeriodTags } from './inspector'

afterEach(cleanup)

function renderInspector(walls = []) {
  const project = createEmptyProject({
    name: 'T',
    units: 'imperial',
    period: 'modern',
    appVersion: '0.0.0',
  })
  project.floors = [createFloor('G', { id: 'g', walls })]
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
  it('renders a PROPERTIES section label through the SectionLabel primitive', () => {
    renderInspector()
    const title = screen.getByText(/properties/i)
    expect(title).toHaveClass('ds-section-label')
    expect(title).not.toHaveClass('inspector__title')
  })

  it('shows no selection count badge when nothing is selected', () => {
    renderInspector()
    expect(screen.queryByText(/\d+ selected/i)).toBeNull()
  })

  it('shows a quiet hint when nothing is selected', () => {
    renderInspector([createWall({ x: 0, y: 0 }, { x: 1000, y: 0 })])
    expect(screen.getByText(/nothing selected/i)).toBeInTheDocument()
  })

  it('shows a first-run cue naming the first action when the plan is empty and nothing is selected', () => {
    renderInspector()
    expect(
      screen.getByText('Pick the Wall tool and click to draw your first wall.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/nothing selected/i)).toBeNull()
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

  it('shows no placeholder entity text when multiple entities are selected', () => {
    const { selection } = renderInspector()
    act(() => {
      selection.setSelection(['wall:w1', 'wall:w2'])
    })
    expect(screen.queryByText(/wall selected/i)).toBeNull()
    expect(screen.queryByText(/nothing selected/i)).toBeNull()
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

  it('shows no period tags when no room with overrides is selected', () => {
    renderInspector()
    expect(screen.queryByRole('listitem')).toBeNull()
  })
})

describe('PeriodTags', () => {
  it('shows a period tag chip when periodName is provided', () => {
    render(<PeriodTags periodName="Victorian" styleName={undefined} />)
    expect(screen.getByText('Victorian')).toBeInTheDocument()
    expect(screen.getByText('Victorian')).toHaveClass('inspector__period-tag')
  })

  it('shows both a period and a style chip when both are provided', () => {
    render(<PeriodTags periodName="Victorian" styleName="Queen Anne" />)
    expect(screen.getByText('Victorian')).toBeInTheDocument()
    expect(screen.getByText('Queen Anne')).toBeInTheDocument()
  })

  it('renders nothing when both periodName and styleName are undefined', () => {
    const { container } = render(<PeriodTags periodName={undefined} styleName={undefined} />)
    expect(container.firstChild).toBeNull()
  })
})
