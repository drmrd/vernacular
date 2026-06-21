import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent, fn } from 'storybook/test'
import { setRoomName, type Command, type SetRoomNameParams } from '../../core'
import { RoomNameEditor } from './room-name-editor'

const meta: Meta<typeof RoomNameEditor> = {
  title: 'Editor/RoomNameEditor',
  component: RoomNameEditor,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof RoomNameEditor>

const ROOM_KEY = 'wall-1|wall-2|wall-3'
const ENTERED_NAME = 'Front Parlor'

export const Default: Story = {
  args: { roomKey: ROOM_KEY, name: 'Parlor', dispatch: fn() },
  play: async ({ args, canvasElement }) => {
    const screen = within(canvasElement)

    const input = screen.getByLabelText(/name/i)
    await expect(input).toHaveValue('Parlor')

    await userEvent.clear(input)
    await userEvent.type(input, `${ENTERED_NAME}{Enter}`)

    const expected = setRoomName(ROOM_KEY, ENTERED_NAME)
    await expect(args.dispatch).toHaveBeenCalledTimes(1)
    const command = (args.dispatch as ReturnType<typeof fn>).mock
      .calls[0]?.[0] as Command<SetRoomNameParams>
    await expect(command.type).toBe(expected.type)
    await expect(command.params).toEqual(expected.params)
  },
}
