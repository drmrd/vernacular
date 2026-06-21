import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent, fn } from 'storybook/test'
import { FloorSwitcher, type FloorSummary } from './floor-switcher'

const meta: Meta<typeof FloorSwitcher> = {
  title: 'Editor/FloorSwitcher',
  component: FloorSwitcher,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof FloorSwitcher>

const FLOORS: FloorSummary[] = [
  { id: 'basement', name: 'Basement' },
  { id: 'ground', name: 'Ground Floor' },
  { id: 'first', name: 'First Floor' },
]

function FloorSwitcherController() {
  const [activeFloorId, setActiveFloorId] = useState<string | null>('ground')
  return (
    <FloorSwitcher
      floors={FLOORS}
      activeFloorId={activeFloorId}
      onSelectFloor={setActiveFloorId}
      onAddFloor={fn()}
    />
  )
}

export const Default: Story = {
  render: () => <FloorSwitcherController />,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(
      screen.getByRole('button', { name: 'Ground Floor', pressed: true }),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'First Floor' }))
    await expect(
      await screen.findByRole('button', { name: 'First Floor', pressed: true }),
    ).toBeInTheDocument()
  },
}
