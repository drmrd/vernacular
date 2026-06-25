import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent, fn } from 'storybook/test'
import {
  DEFAULT_METRIC_PREFERENCES,
  setRoomCeilingHeight,
  type Command,
  type SetRoomCeilingHeightParams,
} from '../../core'
import { RoomCeilingHeightEditor } from './room-ceiling-height-editor'

const meta: Meta<typeof RoomCeilingHeightEditor> = {
  title: 'Editor/RoomCeilingHeightEditor',
  component: RoomCeilingHeightEditor,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof RoomCeilingHeightEditor>

const ROOM_KEY = 'wall-1|wall-2|wall-3'
// The metric entry unit defaults to metres, so "3" commits 3000 mm.
const METRE_ENTRY = '3'
const EXPECTED_PARSED_MM = 3000

export const Default: Story = {
  args: {
    roomKey: ROOM_KEY,
    ceilingHeight: 2438,
    dispatch: fn(),
    preferences: DEFAULT_METRIC_PREFERENCES,
  },
  play: async ({ args, canvasElement }) => {
    const screen = within(canvasElement)

    const input = screen.getByLabelText(/ceiling height/i)
    await expect(input).not.toHaveValue('')

    await userEvent.clear(input)
    await userEvent.type(input, `${METRE_ENTRY}{Enter}`)

    const expected = setRoomCeilingHeight(ROOM_KEY, EXPECTED_PARSED_MM)
    await expect(args.dispatch).toHaveBeenCalledTimes(1)
    const command = (args.dispatch as ReturnType<typeof fn>).mock
      .calls[0]?.[0] as Command<SetRoomCeilingHeightParams>
    await expect(command.type).toBe(expected.type)
    await expect(command.params).toEqual(expected.params)
  },
}
