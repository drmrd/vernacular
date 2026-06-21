import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent, fn } from 'storybook/test'
import {
  assignSurfacePaint,
  builtinPalettes,
  colorFromHex,
  type Command,
  type SurfaceRef,
} from '../../core'
import { ColorPicker } from './color-picker'

const meta: Meta<typeof ColorPicker> = {
  title: 'Editor/ColorPicker',
  component: ColorPicker,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof ColorPicker>

const SURFACE: SurfaceRef = { kind: 'floor', floorId: 'floor-1' }
const RECENT = [colorFromHex('#6e2b2b', 'Oxblood'), colorFromHex('#2f4858', 'Slate')]
const FIRST_PALETTE = Object.values(builtinPalettes.entries)[0]!
const FIRST_COLOR = FIRST_PALETTE.colors[0]!

export const Default: Story = {
  args: { surface: SURFACE, finishId: 'matte', recent: RECENT, dispatch: fn() },
  play: async ({ args, canvasElement }) => {
    const screen = within(canvasElement)

    // The recent section appears because recent colors were supplied.
    await expect(screen.getByText('Recent colors')).toBeInTheDocument()

    // Searching by name keeps the matching palette chip visible.
    await userEvent.type(screen.getByLabelText(/search/i), FIRST_COLOR.name)
    const chip = screen.getByRole('button', { name: FIRST_COLOR.name })
    await expect(chip).toBeInTheDocument()

    await userEvent.click(chip)

    const expected = assignSurfacePaint(SURFACE, FIRST_COLOR.color, 'matte')
    await expect(args.dispatch).toHaveBeenCalledTimes(1)
    const command = (args.dispatch as ReturnType<typeof fn>).mock.calls[0]?.[0] as Command
    await expect(command.type).toBe(expected.type)
    await expect(command.params).toEqual(expected.params)
  },
}
