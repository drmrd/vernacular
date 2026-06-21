import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent, fn } from 'storybook/test'
import {
  SET_FURNITURE_NAME,
  createFurnitureInstance,
  type Command,
  type FurnitureInstance,
} from '../../core'
import { FurnitureInspector } from './furniture-inspector'

const meta: Meta<typeof FurnitureInspector> = {
  title: 'Editor/FurnitureInspector',
  component: FurnitureInspector,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof FurnitureInspector>

const FLOOR_ID = 'floor-1'
const FURNITURE_ID = 'f1'
const NEW_NAME = 'Reading Chair'

function buildFurniture(): FurnitureInstance {
  return createFurnitureInstance({
    id: FURNITURE_ID,
    assetRef: { scope: 'user', contentHash: 'h' },
    position: { x: 0, y: 0 },
    footprint: { width: 600, depth: 400 },
    height: 750,
    rotation: 0,
    name: 'Chair',
  })
}

export const Default: Story = {
  args: {
    floorId: FLOOR_ID,
    furniture: buildFurniture(),
    units: 'metric',
    dispatch: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const screen = within(canvasElement)

    const nameInput = screen.getByLabelText('Name')
    await expect(nameInput).toHaveValue('Chair')

    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, `${NEW_NAME}{Enter}`)

    const command = (args.dispatch as ReturnType<typeof fn>).mock.calls.find(
      (call) => (call[0] as Command).type === SET_FURNITURE_NAME,
    )?.[0] as Command<{ floorId: string; furnitureId: string; name: string }>
    await expect(command).toBeDefined()
    await expect(command.params).toEqual({
      floorId: FLOOR_ID,
      furnitureId: FURNITURE_ID,
      name: NEW_NAME,
    })
  },
}
