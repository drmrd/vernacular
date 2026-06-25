import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent, fn } from 'storybook/test'
import { DEFAULT_METRIC_PREFERENCES } from '../../core'
import { LengthField } from './length-field'

const meta: Meta<typeof LengthField> = {
  title: 'Editor/LengthField',
  component: LengthField,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof LengthField>

// The metric entry unit defaults to metres, so "1.2" commits 1200 mm.
const ENTERED_VALUE = '1.2'

export const Metric: Story = {
  args: {
    inputId: 'opening-width-o1',
    label: 'Width',
    valueMm: 900,
    preferences: DEFAULT_METRIC_PREFERENCES,
    onCommitMm: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const screen = within(canvasElement)

    // The entry unit lives in the picker, so the field's label is just "Width".
    const input = screen.getByLabelText('Width')
    await userEvent.clear(input)
    await userEvent.type(input, `${ENTERED_VALUE}{Enter}`)

    await expect(args.onCommitMm).toHaveBeenCalledTimes(1)
    await expect(args.onCommitMm).toHaveBeenCalledWith(1200)
  },
}
