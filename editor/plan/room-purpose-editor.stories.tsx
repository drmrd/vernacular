import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent, fn } from 'storybook/test'
import { setRoomPurpose, type Command, type SetRoomPurposeParams } from '../../core'
import { RoomPurposeEditor } from './room-purpose-editor'

const meta: Meta<typeof RoomPurposeEditor> = {
  title: 'Editor/RoomPurposeEditor',
  component: RoomPurposeEditor,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof RoomPurposeEditor>

const ROOM_KEY = 'wall-1|wall-2|wall-3'
const SEEDED_PURPOSE = 'parlor'
const CHOSEN_PURPOSE = 'kitchen'

export const Default: Story = {
  args: { roomKey: ROOM_KEY, purpose: SEEDED_PURPOSE, dispatch: fn() },
  play: async ({ args, canvasElement }) => {
    const screen = within(canvasElement)

    const select = screen.getByLabelText('Purpose')
    await expect(select).toHaveValue(SEEDED_PURPOSE)

    await userEvent.selectOptions(select, CHOSEN_PURPOSE)

    const expected = setRoomPurpose(ROOM_KEY, CHOSEN_PURPOSE)
    await expect(args.dispatch).toHaveBeenCalledTimes(1)
    const command = (args.dispatch as ReturnType<typeof fn>).mock
      .calls[0]?.[0] as Command<SetRoomPurposeParams>
    await expect(command.type).toBe(expected.type)
    await expect(command.params).toEqual(expected.params)
  },
}
