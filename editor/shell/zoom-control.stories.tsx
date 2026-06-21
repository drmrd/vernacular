import { useMemo, type ReactElement } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent } from 'storybook/test'
import {
  EditorSessionProvider,
  ActiveFloorProvider,
  createEditorSession,
  createActiveFloorStore,
} from '../../bridge'
import { createEmptyProject, createFloor } from '../../core'
import { ViewportProvider } from '../plan/viewport-context'
import { ZoomControl } from './zoom-control'

const meta: Meta<typeof ZoomControl> = {
  title: 'Editor/ZoomControl',
  component: ZoomControl,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof ZoomControl>

const FLOOR_ID = 'ground'

// The control reads the viewport, active floor, and scene-graph contexts to draw
// its live percent readout. A one-floor session plus the viewport provider gives
// it a real camera to display; the readout opens at 100% of the default scale.
function ZoomControlHarness(): ReactElement {
  const session = useMemo(() => {
    const project = createEmptyProject({
      name: 'Sample plan',
      units: 'imperial',
      period: 'modern',
      appVersion: '0.0.0',
    })
    project.floors = [createFloor('Ground', { id: FLOOR_ID })]
    return createEditorSession(project)
  }, [])
  const activeFloor = useMemo(() => createActiveFloorStore(FLOOR_ID), [])

  return (
    <EditorSessionProvider session={session}>
      <ActiveFloorProvider store={activeFloor}>
        <ViewportProvider>
          <ZoomControl />
        </ViewportProvider>
      </ActiveFloorProvider>
    </EditorSessionProvider>
  )
}

export const Default: Story = {
  render: () => <ZoomControlHarness />,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)

    // The default scale reads as 100%, and the four zoom controls are present.
    await expect(screen.getByText('100%')).toBeInTheDocument()
    await expect(screen.getByRole('button', { name: /zoom out/i })).toBeInTheDocument()
    await expect(screen.getByRole('button', { name: /zoom in/i })).toBeInTheDocument()
    await expect(screen.getByRole('button', { name: /fit to content/i })).toBeInTheDocument()

    // Zooming in scales the readout above 100% and resetting returns it.
    await userEvent.click(screen.getByRole('button', { name: /zoom in/i }))
    await expect(screen.getByText('125%')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /reset zoom to 100%/i }))
    await expect(screen.getByText('100%')).toBeInTheDocument()
  },
}
