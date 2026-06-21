import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent, fn } from 'storybook/test'
import { setRoomPeriod, type Command, type SetRoomPeriodParams } from '../../core'
import { RoomPeriodEditor } from './room-period-editor'

const meta: Meta<typeof RoomPeriodEditor> = {
  title: 'Editor/RoomPeriodEditor',
  component: RoomPeriodEditor,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof RoomPeriodEditor>

const ROOM_KEY = 'wall-1|wall-2|wall-3'
const SEEDED_PERIOD = 'victorian'
const CHOSEN_PERIOD = 'edwardian'

export const Default: Story = {
  args: { roomKey: ROOM_KEY, period: SEEDED_PERIOD, dispatch: fn() },
  play: async ({ args, canvasElement }) => {
    const screen = within(canvasElement)

    const select = screen.getByLabelText('Period')
    await expect(select).toHaveValue(SEEDED_PERIOD)

    await userEvent.selectOptions(select, CHOSEN_PERIOD)

    const expected = setRoomPeriod(ROOM_KEY, CHOSEN_PERIOD)
    await expect(args.dispatch).toHaveBeenCalledTimes(1)
    const command = (args.dispatch as ReturnType<typeof fn>).mock
      .calls[0]?.[0] as Command<SetRoomPeriodParams>
    await expect(command.type).toBe(expected.type)
    await expect(command.params).toEqual(expected.params)
  },
}
