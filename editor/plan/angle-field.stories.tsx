import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent, fn } from 'storybook/test'
import { AngleField } from './angle-field'
import { DEG_TO_RAD } from './angles'

const meta: Meta<typeof AngleField> = {
  title: 'Editor/AngleField',
  component: AngleField,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof AngleField>

// A quarter turn in radians, so the seeded field opens on "90" rather than "1.57".
const QUARTER_TURN_RADIANS = Math.PI / 2
const QUARTER_TURN_DEGREES = '90'
const ENTERED_DEGREES = '45'

export const Default: Story = {
  args: {
    inputId: 'stair-angle-s1',
    rotation: QUARTER_TURN_RADIANS,
    onCommit: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const screen = within(canvasElement)

    const input = screen.getByLabelText('Angle (deg)')
    await expect(input).toHaveValue(QUARTER_TURN_DEGREES)

    await userEvent.clear(input)
    await userEvent.type(input, `${ENTERED_DEGREES}{Enter}`)

    // Degrees in, radians out: degrees are what people type, radians are what the
    // model and the rotation commands carry.
    await expect(args.onCommit).toHaveBeenCalledWith(Number(ENTERED_DEGREES) * DEG_TO_RAD)
  },
}

export const RejectsAnUnparseableEntry: Story = {
  args: {
    inputId: 'stair-angle-s2',
    rotation: QUARTER_TURN_RADIANS,
    onCommit: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const screen = within(canvasElement)

    const input = screen.getByLabelText('Angle (deg)')
    await userEvent.clear(input)
    await userEvent.type(input, 'sideways{Enter}')

    // Nothing commits, so the last good angle stands.
    await expect(args.onCommit).not.toHaveBeenCalled()
  },
}
