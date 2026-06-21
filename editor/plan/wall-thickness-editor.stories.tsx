import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent, fn } from 'storybook/test'
import {
  DEFAULT_METRIC_PREFERENCES,
  SET_WALL_THICKNESS,
  parseLength,
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
const VALID_ENTRY = '150'
const EXPECTED_PARSED_MM = parseLength(VALID_ENTRY, { assumeUnit: 'mm' })

export const Default: Story = {
  args: {
    floorId: FLOOR_ID,
    wallId: WALL_ID,
    // 100 mm renders as "10.0 cm" under the adaptive metric rule.
    thickness: 100,
    dispatch: fn(),
    preferences: DEFAULT_METRIC_PREFERENCES,
  },
  play: async ({ args, canvasElement }) => {
    const screen = within(canvasElement)

    const input = screen.getByLabelText(/thickness/i)
    await expect(input).toHaveValue('10.0 cm')

    await userEvent.clear(input)
    await userEvent.type(input, `${VALID_ENTRY}{Enter}`)

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
