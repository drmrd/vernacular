import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent, fn } from 'storybook/test'
import {
  REMOVE_UNDERLAY,
  createUnderlay,
  type AssetReference,
  type Command,
  type RemoveUnderlayParams,
  type Underlay,
} from '../../core'
import { UnderlayRow } from './underlay-panel'

const meta: Meta<typeof UnderlayRow> = {
  title: 'Editor/UnderlayRow',
  component: UnderlayRow,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof UnderlayRow>

const FLOOR_ID = 'ground'
const IMAGE: AssetReference = { scope: 'project', contentHash: 'deadbeef' }
const ROW_LABEL = 'Plan scan'

function newUnderlay(): Underlay {
  return createUnderlay({ image: IMAGE, width: 1024, height: 768 })
}

const UNDERLAY = newUnderlay()

export const Default: Story = {
  args: {
    floorId: FLOOR_ID,
    underlay: UNDERLAY,
    label: ROW_LABEL,
    dispatch: fn(),
    onCalibrate: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const screen = within(canvasElement)

    // The row shows its label and the four underlay controls.
    await expect(screen.getByText(ROW_LABEL)).toBeInTheDocument()
    await expect(screen.getByLabelText(/opacity/i)).toBeInTheDocument()
    await expect(screen.getByRole('checkbox', { name: /visible/i })).toBeInTheDocument()

    // Calibrate routes through the callback prop, not a dispatch.
    await userEvent.click(screen.getByRole('button', { name: /calibrate/i }))
    await expect(args.onCalibrate).toHaveBeenCalledTimes(1)
    await expect(args.onCalibrate).toHaveBeenCalledWith(UNDERLAY.id)
    await expect(args.dispatch).not.toHaveBeenCalled()

    // Remove dispatches the remove-underlay command for this floor and underlay.
    await userEvent.click(screen.getByRole('button', { name: /remove/i }))
    await expect(args.dispatch).toHaveBeenCalledTimes(1)
    const command = (args.dispatch as ReturnType<typeof fn>).mock
      .calls[0]?.[0] as Command<RemoveUnderlayParams>
    await expect(command.type).toBe(REMOVE_UNDERLAY)
    await expect(command.params).toEqual({ floorId: FLOOR_ID, underlayId: UNDERLAY.id })
  },
}
