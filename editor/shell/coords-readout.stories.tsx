import { useEffect, useMemo, type ReactElement } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect } from 'storybook/test'
import { EditorSessionProvider, createEditorSession } from '../../bridge'
import { createEmptyProject, feetToMillimeters, type Point } from '../../core'
import { PointerReadoutProvider, useReportPointer } from '../plan/pointer-readout'
import { CoordsReadout } from './coords-readout'

const meta: Meta<typeof CoordsReadout> = {
  title: 'Editor/CoordsReadout',
  component: CoordsReadout,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof CoordsReadout>

// The readout renders nothing until a world point is reported, so the harness
// seeds one through the same reporter the plan canvas uses on a pointer move.
// This drives the real coordinate text the user sees while hovering the plan,
// not a contrived placeholder, and gives the visual gate content to snapshot.
function SeedPointer({ world }: { world: Point }): null {
  const report = useReportPointer()
  useEffect(() => {
    report(world)
  }, [report, world])
  return null
}

interface CoordsReadoutHarnessProps {
  units: 'metric' | 'imperial'
  world: Point
}

function CoordsReadoutHarness({ units, world }: CoordsReadoutHarnessProps): ReactElement {
  const session = useMemo(() => {
    const project = createEmptyProject({
      name: 'Sample plan',
      units,
      period: 'modern',
      appVersion: '0.0.0',
    })
    return createEditorSession(project)
  }, [units])

  return (
    <EditorSessionProvider session={session}>
      <PointerReadoutProvider>
        <SeedPointer world={world} />
        <CoordsReadout />
      </PointerReadoutProvider>
    </EditorSessionProvider>
  )
}

export const Metric: Story = {
  render: () => <CoordsReadoutHarness units="metric" world={{ x: 1000, y: 2000 }} />,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(await screen.findByText('1.00 m, 2.00 m')).toBeInTheDocument()
  },
}

export const Imperial: Story = {
  render: () => (
    <CoordsReadoutHarness
      units="imperial"
      world={{ x: feetToMillimeters(3), y: feetToMillimeters(4) }}
    />
  ),
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(await screen.findByText("3', 4'")).toBeInTheDocument()
  },
}
