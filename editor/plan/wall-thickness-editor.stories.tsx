import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent, fn } from 'storybook/test'
import {
  DEFAULT_METRIC_PREFERENCES,
  SET_WALL_THICKNESS,
  type Command,
  type SetWallThicknessParams,
} from '../../core'
import { WallThicknessEditor } from './wall-thickness-editor'

const meta: Meta<typeof WallThicknessEditor> = {
  title: 'Editor/WallThicknessEditor',
  component: WallThicknessEditor,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof WallThicknessEditor>

const FLOOR_ID = 'ground'
const WALL_ID = 'wall-1'
// The metric entry unit defaults to metres, so "0.15" commits 150 mm.
const METRE_ENTRY = '0.15'
const EXPECTED_PARSED_MM = 150

export const Default: Story = {
  args: {
    floorId: FLOOR_ID,
    wallId: WALL_ID,
    // 100 mm shows as the bare magnitude "0.1" in the default metres entry unit.
    thickness: 100,
    dispatch: fn(),
    preferences: DEFAULT_METRIC_PREFERENCES,
  },
  play: async ({ args, canvasElement }) => {
    const screen = within(canvasElement)

    const input = screen.getByLabelText(/thickness/i)
    await expect(input).toHaveValue('0.1')

    await userEvent.clear(input)
    await userEvent.type(input, `${METRE_ENTRY}{Enter}`)

    await expect(args.dispatch).toHaveBeenCalledTimes(1)
    const command = (args.dispatch as ReturnType<typeof fn>).mock
      .calls[0]?.[0] as Command<SetWallThicknessParams>
    await expect(command.type).toBe(SET_WALL_THICKNESS)
    await expect(command.params).toEqual({
      floorId: FLOOR_ID,
      wallId: WALL_ID,
      thickness: EXPECTED_PARSED_MM,
    })
  },
}
