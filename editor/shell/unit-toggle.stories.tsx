import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent } from 'storybook/test'
import type { UnitSystem } from '../../core'
import { UnitToggle } from './unit-toggle'

const meta: Meta<typeof UnitToggle> = {
  title: 'Shell/UnitToggle',
  component: UnitToggle,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof UnitToggle>

function UnitToggleController() {
  const [units, setUnits] = useState<UnitSystem>('metric')
  return <UnitToggle units={units} onChange={setUnits} />
}

export const Default: Story = {
  render: () => <UnitToggleController />,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByRole('button', { name: 'Metric', pressed: true })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Imperial' }))
    await expect(
      await screen.findByRole('button', { name: 'Imperial', pressed: true }),
    ).toBeInTheDocument()
  },
}
