import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import {
  EditorSessionProvider,
  SelectionProvider,
  ActiveFloorProvider,
  SurfaceSelectionProvider,
  createEditorSession,
  createSelectionStore,
  createActiveFloorStore,
  createSurfaceSelectionStore,
} from '../../bridge'
import {
  createEmptyProject,
  createFloor,
  createStair,
  createWall,
  deriveRooms,
  ROOM_ID_PREFIX,
  STAIR_NODE_PREFIX,
  type Project,
  type Wall,
} from '../../core'
import { Inspector, PeriodTags } from './inspector'

afterEach(cleanup)

function renderInspector(
  walls: Wall[] = [],
  roomOverrides?: Project['roomOverrides'],
  stairs: Project['stairs'] = [],
) {
  const project = createEmptyProject({
    name: 'T',
    units: 'imperial',
    period: 'modern',
    appVersion: '0.0.0',
  })
  project.floors = [createFloor('G', { id: 'g', walls })]
  project.roomOverrides = roomOverrides
  project.stairs = stairs
  const session = createEditorSession(project)
  const selection = createSelectionStore()
  const activeFloor = createActiveFloorStore('g')
  const surfaceSelection = createSurfaceSelectionStore()
  render(
    <EditorSessionProvider session={session}>
      <SelectionProvider store={selection}>
        <ActiveFloorProvider store={activeFloor}>
          <SurfaceSelectionProvider store={surfaceSelection}>
            <Inspector />
          </SurfaceSelectionProvider>
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
    expect(screen.getByText('Nothing selected yet')).toBeInTheDocument()
  })

  it('shows a first-run cue naming the first action when the plan is empty and nothing is selected', () => {
    renderInspector()
    expect(screen.getByText('Draw your first wall to get started')).toBeInTheDocument()
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

  it('groups a selected room\'s purpose, period, and style editors under a "Character and period" section header', () => {
    const walls = [
      createWall({ x: 0, y: 0 }, { x: 1000, y: 0 }),
      createWall({ x: 1000, y: 0 }, { x: 1000, y: 1000 }),
      createWall({ x: 1000, y: 1000 }, { x: 0, y: 1000 }),
      createWall({ x: 0, y: 1000 }, { x: 0, y: 0 }),
    ]
    const { selection } = renderInspector(walls)
    const [room] = deriveRooms(walls)
    if (room === undefined) throw new Error('expected the closed wall loop to derive one room')
    act(() => {
      selection.select(room.id)
    })
    expect(screen.getByText('Character and period')).toBeInTheDocument()
  })

  it("renders a selected room's style override as the style display name, not a stringified object", () => {
    const walls = [
      createWall({ x: 0, y: 0 }, { x: 1000, y: 0 }),
      createWall({ x: 1000, y: 0 }, { x: 1000, y: 1000 }),
      createWall({ x: 1000, y: 1000 }, { x: 0, y: 1000 }),
      createWall({ x: 0, y: 1000 }, { x: 0, y: 0 }),
    ]
    const [room] = deriveRooms(walls)
    if (room === undefined) throw new Error('expected the closed wall loop to derive one room')
    const roomKey = room.id.slice(ROOM_ID_PREFIX.length)
    const { selection } = renderInspector(walls, {
      [roomKey]: { styleOverride: { styleId: 'craftsman' } },
    })
    act(() => {
      selection.select(room.id)
    })
    expect(
      screen.getByText('Craftsman', { selector: '.inspector__period-tag' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('[object Object]')).toBeNull()
  })

  it('shows a whole-storey note instead of the Floor chip when a selected room shares its storey with another room', () => {
    const walls = [
      createWall({ x: 0, y: 0 }, { x: 2000, y: 0 }),
      createWall({ x: 2000, y: 0 }, { x: 2000, y: 1000 }),
      createWall({ x: 2000, y: 1000 }, { x: 0, y: 1000 }),
      createWall({ x: 0, y: 1000 }, { x: 0, y: 0 }),
      createWall({ x: 1000, y: 0 }, { x: 1000, y: 1000 }),
    ]
    const rooms = deriveRooms(walls)
    expect(rooms).toHaveLength(2)
    const [room] = rooms
    if (room === undefined) throw new Error('expected the split wall loop to derive two rooms')
    const { selection } = renderInspector(walls)
    act(() => {
      selection.select(room.id)
    })

    expect(
      screen.getByText(
        'This storey holds 2 rooms, so a finish here would repaint every one of them. Per-room floor and ceiling finishes are not available yet.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Floor' })).toBeNull()
  })

  it('shows a Transform section header when a transformable entity is selected', () => {
    const wall = createWall({ x: 0, y: 0 }, { x: 1000, y: 0 })
    const { selection } = renderInspector([wall])
    expect(screen.queryByText('Transform')).toBeNull()
    act(() => {
      selection.select(`wall:${wall.id}`)
    })
    expect(screen.getByText('Transform')).toBeInTheDocument()
  })
})

describe('Inspector with a stair selected', () => {
  it("renders the stair inspector's angle field when exactly one stair is selected", () => {
    const stair = createStair({
      id: 's1',
      connection: { fromFloorId: 'g', toFloorId: 'upper' },
    })
    const { selection } = renderInspector([], undefined, [stair])
    act(() => {
      selection.select(`${STAIR_NODE_PREFIX}${stair.id}`)
    })
    expect(screen.getByLabelText('Angle (deg)')).toBeInTheDocument()
  })

  it('shows a Stair component title when exactly one stair is selected', () => {
    const stair = createStair({
      id: 's1',
      connection: { fromFloorId: 'g', toFloorId: 'upper' },
    })
    const { selection } = renderInspector([], undefined, [stair])
    act(() => {
      selection.select(`${STAIR_NODE_PREFIX}${stair.id}`)
    })
    const title = screen.getByRole('heading', { level: 3 })
    expect(title).toHaveTextContent(/stair/i)
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
