import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent, fn } from 'storybook/test'
import { assignSurfacePaint, colorFromHex, type Command, type SurfaceRef } from '../../core'
import { FinishPicker } from './finish-picker'

const meta: Meta<typeof FinishPicker> = {
  title: 'Editor/FinishPicker',
  component: FinishPicker,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof FinishPicker>

const SURFACE: SurfaceRef = { kind: 'wall-face', wallId: 'wall-1', side: 'left' }
const COLOR = colorFromHex('#9aa583')

export const Default: Story = {
  args: { surface: SURFACE, color: COLOR, finishId: 'matte', dispatch: fn() },
  play: async ({ args, canvasElement }) => {
    const screen = within(canvasElement)

    await userEvent.click(screen.getByRole('radio', { name: /satin/i }))

    const expected = assignSurfacePaint(SURFACE, COLOR, 'satin')
    await expect(args.dispatch).toHaveBeenCalledTimes(1)
    const command = (args.dispatch as ReturnType<typeof fn>).mock.calls[0]?.[0] as Command
    await expect(command.type).toBe(expected.type)
    await expect(command.params).toEqual(expected.params)
  },
}
