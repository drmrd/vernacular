import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent, fn } from 'storybook/test'
import {
  ROTATE_STAIR,
  createStair,
  type Command,
  type RotateStairParams,
  type Stair,
} from '../../core'
import { DEG_TO_RAD } from './angles'
import { StairInspector } from './stair-inspector'

const meta: Meta<typeof StairInspector> = {
  title: 'Editor/StairInspector',
  component: StairInspector,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof StairInspector>

const STAIR_ID = 's1'
const ENTERED_DEGREES = '45'

function buildStair(): Stair {
  return createStair({
    id: STAIR_ID,
    position: { x: 2000, y: 1500 },
    rotation: 0,
    connection: { fromFloorId: 'ground', toFloorId: 'upper' },
  })
}

export const Default: Story = {
  args: {
    stair: buildStair(),
    dispatch: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const screen = within(canvasElement)

    const angleInput = screen.getByLabelText('Angle (deg)')
    await expect(angleInput).toHaveValue('0')

    await userEvent.clear(angleInput)
    await userEvent.type(angleInput, `${ENTERED_DEGREES}{Enter}`)

    const command = (args.dispatch as ReturnType<typeof fn>).mock.calls.find(
      (call) => (call[0] as Command).type === ROTATE_STAIR,
    )?.[0] as Command<RotateStairParams>
    await expect(command).toBeDefined()
    await expect(command.params).toEqual({
      stairId: STAIR_ID,
      rotation: Number(ENTERED_DEGREES) * DEG_TO_RAD,
    })
  },
}
