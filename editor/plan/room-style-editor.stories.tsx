import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent, fn } from 'storybook/test'
import { setRoomStyle, type Command, type SetRoomStyleParams, type StyleTag } from '../../core'
import { RoomStyleEditor } from './room-style-editor'

const meta: Meta<typeof RoomStyleEditor> = {
  title: 'Editor/RoomStyleEditor',
  component: RoomStyleEditor,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof RoomStyleEditor>

const ROOM_KEY = 'wall-1|wall-2|wall-3'
const SEEDED_STYLE: StyleTag = { styleId: 'queen-anne' }
const CHOSEN_STYLE_ID = 'craftsman'

export const Default: Story = {
  args: { roomKey: ROOM_KEY, style: SEEDED_STYLE, dispatch: fn() },
  play: async ({ args, canvasElement }) => {
    const screen = within(canvasElement)

    const select = screen.getByLabelText('Style')
    await expect(select).toHaveValue(SEEDED_STYLE.styleId)

    await userEvent.selectOptions(select, CHOSEN_STYLE_ID)

    const expected = setRoomStyle(ROOM_KEY, { styleId: CHOSEN_STYLE_ID })
    await expect(args.dispatch).toHaveBeenCalledTimes(1)
    const command = (args.dispatch as ReturnType<typeof fn>).mock
      .calls[0]?.[0] as Command<SetRoomStyleParams>
    await expect(command.type).toBe(expected.type)
    await expect(command.params).toEqual(expected.params)
  },
}
