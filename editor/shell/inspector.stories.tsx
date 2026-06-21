import { useEffect, useMemo, type ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect } from 'storybook/test'
import {
  EditorSessionProvider,
  SelectionProvider,
  ActiveFloorProvider,
  createEditorSession,
  createSelectionStore,
  createActiveFloorStore,
} from '../../bridge'
import { createEmptyProject, createFloor, createWall, type Wall } from '../../core'
import { Inspector } from './inspector'

const meta: Meta<typeof Inspector> = {
  title: 'Editor/Inspector',
  component: Inspector,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof Inspector>

const FLOOR_ID = 'ground'

interface InspectorHarnessProps {
  walls?: Wall[]
  selectId?: string
  children?: ReactNode
}

// Mirrors inspector.test.tsx renderInspector: a project with one floor, fed
// through the editor-session, selection, and active-floor providers. An optional
// id is selected on mount so a content-bearing story renders (the visual gate
// cannot snapshot an empty root, and a selection drives the wall inspector).
function InspectorHarness({ walls = [], selectId }: InspectorHarnessProps) {
  const session = useMemo(() => {
    const project = createEmptyProject({
      name: 'Sample plan',
      units: 'imperial',
      period: 'modern',
      appVersion: '0.0.0',
    })
    project.floors = [createFloor('Ground', { id: FLOOR_ID, walls })]
    return createEditorSession(project)
  }, [walls])
  const selection = useMemo(() => createSelectionStore(), [])
  const activeFloor = useMemo(() => createActiveFloorStore(FLOOR_ID), [])

  useEffect(() => {
    if (selectId !== undefined) {
      selection.select(selectId)
    }
  }, [selection, selectId])

  return (
    <EditorSessionProvider session={session}>
      <SelectionProvider store={selection}>
        <ActiveFloorProvider store={activeFloor}>
          <Inspector />
        </ActiveFloorProvider>
      </SelectionProvider>
    </EditorSessionProvider>
  )
}

export const NothingSelected: Story = {
  render: () => <InspectorHarness />,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByText(/properties/i)).toBeInTheDocument()
    await expect(
      screen.getByText('Pick the Wall tool and click to draw your first wall.'),
    ).toBeInTheDocument()
  },
}

const SELECTED_WALL = createWall({ x: 0, y: 0 }, { x: 1000, y: 0 })

export const WallSelected: Story = {
  render: () => <InspectorHarness walls={[SELECTED_WALL]} selectId={`wall:${SELECTED_WALL.id}`} />,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(await screen.findByText('1 selected')).toBeInTheDocument()
    const title = await screen.findByRole('heading', { level: 3 })
    await expect(title).toHaveTextContent(/wall/i)
    await expect(await screen.findByText('Transform')).toBeInTheDocument()
  },
}
