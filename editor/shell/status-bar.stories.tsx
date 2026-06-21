import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent, fn } from 'storybook/test'
import { StatusBar, type StatusBarProps } from './status-bar'
import type { FloorSummary } from './floor-switcher'

const FLOORS: FloorSummary[] = [
  { id: 'ground', name: 'Ground Floor' },
  { id: 'first', name: 'First Floor' },
]

function StatusBarController(props: Omit<StatusBarProps, 'activeFloorId' | 'onSelectFloor'>) {
  const [activeFloorId, setActiveFloorId] = useState<string | null>('ground')
  return (
    <StatusBar
      {...props}
      floors={FLOORS}
      activeFloorId={activeFloorId}
      onSelectFloor={setActiveFloorId}
    />
  )
}

const meta: Meta<typeof StatusBar> = {
  title: 'Editor/StatusBar',
  component: StatusBar,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof StatusBar>

export const Default: Story = {
  render: () => (
    <StatusBarController
      floors={FLOORS}
      onAddFloor={fn()}
      tool={<span>Tool: Select</span>}
      coords={<span>3 ft, 4 ft</span>}
      snap={<span>Snapping on</span>}
      units={<span>Feet</span>}
    />
  ),
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByText('Tool: Select')).toBeInTheDocument()
    await expect(screen.getByText('3 ft, 4 ft')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /First Floor/ }))
    await expect(
      await screen.findByRole('button', { name: /First Floor/, pressed: true }),
    ).toBeInTheDocument()
  },
}
