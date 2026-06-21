import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent, fn } from 'storybook/test'
import { ROTATE_ENTITIES, type Command, type Point, type RotateEntitiesParams } from '../../core'
import { SelectionTransformPanel } from './selection-transform-panel'

const meta: Meta<typeof SelectionTransformPanel> = {
  title: 'Editor/SelectionTransformPanel',
  component: SelectionTransformPanel,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof SelectionTransformPanel>

// Plan space is y-up, so a counter-clockwise quarter turn is a positive angle.
const FLOOR_ID = 'floor-1'
const ENTITY_IDS = ['w1', 'd1']
const CENTER: Point = { x: 50, y: 0 }
const QUARTER_TURN = Math.PI / 2

export const Default: Story = {
  args: {
    floorId: FLOOR_ID,
    entityIds: ENTITY_IDS,
    center: CENTER,
    dispatch: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const screen = within(canvasElement)

    await userEvent.click(screen.getByRole('button', { name: /counter-?clockwise|rotate left/i }))

    await expect(args.dispatch).toHaveBeenCalledTimes(1)
    const command = (args.dispatch as ReturnType<typeof fn>).mock
      .calls[0]?.[0] as Command<RotateEntitiesParams>
    await expect(command.type).toBe(ROTATE_ENTITIES)
    await expect(command.params).toEqual({
      floorId: FLOOR_ID,
      entityIds: ENTITY_IDS,
      pivot: CENTER,
      radians: QUARTER_TURN,
    })
  },
}
