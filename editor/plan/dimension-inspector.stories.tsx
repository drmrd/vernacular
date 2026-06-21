import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent, fn } from 'storybook/test'
import { REMOVE_DIMENSION, type Command } from '../../core'
import { DimensionInspector } from './dimension-inspector'

const meta: Meta<typeof DimensionInspector> = {
  title: 'Editor/DimensionInspector',
  component: DimensionInspector,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof DimensionInspector>

export const Default: Story = {
  args: {
    floorId: 'floor-1',
    dimensionId: 'd1',
    // A metre-scale length reads in metres: 1000 mm renders as "1.00 m".
    length: 1000,
    units: 'metric',
    dispatch: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const screen = within(canvasElement)

    await expect(screen.getByText('1.00 m')).toBeInTheDocument()

    // The first Remove click only arms the confirm; nothing dispatches yet.
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await expect(args.dispatch).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Confirm remove' }))
    await expect(args.dispatch).toHaveBeenCalledTimes(1)
    const command = (args.dispatch as ReturnType<typeof fn>).mock.calls[0]?.[0] as Command
    await expect(command.type).toBe(REMOVE_DIMENSION)
  },
}
