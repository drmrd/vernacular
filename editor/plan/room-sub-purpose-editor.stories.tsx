import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent, fn } from 'storybook/test'
import { setRoomSubPurpose, type Command, type SetRoomSubPurposeParams } from '../../core'
import { RoomSubPurposeEditor } from './room-sub-purpose-editor'

const meta: Meta<typeof RoomSubPurposeEditor> = {
  title: 'Editor/RoomSubPurposeEditor',
  component: RoomSubPurposeEditor,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof RoomSubPurposeEditor>

const ROOM_KEY = 'wall-1|wall-2|wall-3'
const SEEDED_SUB_PURPOSE = 'Silver Pantry'
const ENTERED_SUB_PURPOSE = 'Cold Pantry'

export const Default: Story = {
  args: { roomKey: ROOM_KEY, subPurpose: SEEDED_SUB_PURPOSE, dispatch: fn() },
  play: async ({ args, canvasElement }) => {
    const screen = within(canvasElement)

    const input = screen.getByLabelText('Sub-purpose')
    await expect(input).toHaveValue(SEEDED_SUB_PURPOSE)

    await userEvent.clear(input)
    await userEvent.type(input, `${ENTERED_SUB_PURPOSE}{Enter}`)

    const expected = setRoomSubPurpose(ROOM_KEY, ENTERED_SUB_PURPOSE)
    await expect(args.dispatch).toHaveBeenCalledTimes(1)
    const command = (args.dispatch as ReturnType<typeof fn>).mock
      .calls[0]?.[0] as Command<SetRoomSubPurposeParams>
    await expect(command.type).toBe(expected.type)
    await expect(command.params).toEqual(expected.params)
  },
}
