import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent, fn } from 'storybook/test'
import {
  RESIZE_OPENING,
  createOpening,
  parseLength,
  type Command,
  type Opening,
  type ResizeOpeningParams,
} from '../../core'
import { OpeningInspector } from './opening-inspector'

const meta: Meta<typeof OpeningInspector> = {
  title: 'Editor/OpeningInspector',
  component: OpeningInspector,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof OpeningInspector>

const FLOOR_ID = 'floor-1'
const OPENING_ID = 'o1'
const WIDTH_MM = 813
const HEIGHT_MM = 2032
const SILL_HEIGHT_MM = 0

// A door-width-scale length reads in centimetres with one decimal under the
// adaptive metric rule: 813 mm renders as "81.3 cm".
const EXPECTED_WIDTH = '81.3 cm'
const NEW_WIDTH_ENTRY = '900'
const EXPECTED_NEW_WIDTH_MM = parseLength(NEW_WIDTH_ENTRY, { assumeUnit: 'mm' })

function buildOpening(): Opening {
  return createOpening({
    type: 'single-swing-door',
    hostWallId: 'w1',
    position: 1000,
    width: WIDTH_MM,
    height: HEIGHT_MM,
    sillHeight: SILL_HEIGHT_MM,
    id: OPENING_ID,
  })
}

export const Default: Story = {
  args: {
    floorId: FLOOR_ID,
    opening: buildOpening(),
    units: 'metric',
    dispatch: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const screen = within(canvasElement)

    const widthInput = screen.getByLabelText(/width/i)
    await expect(widthInput).toHaveValue(EXPECTED_WIDTH)

    await userEvent.clear(widthInput)
    await userEvent.type(widthInput, `${NEW_WIDTH_ENTRY}{Enter}`)

    await expect(args.dispatch).toHaveBeenCalledTimes(1)
    const command = (args.dispatch as ReturnType<typeof fn>).mock
      .calls[0]?.[0] as Command<ResizeOpeningParams>
    await expect(command.type).toBe(RESIZE_OPENING)
    await expect(command.params.dimensions).toEqual({
      width: EXPECTED_NEW_WIDTH_MM,
      height: HEIGHT_MM,
      sillHeight: SILL_HEIGHT_MM,
    })
  },
}
