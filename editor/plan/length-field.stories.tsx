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

// A metric project reads a bare number as millimeters, so "1200" commits 1200.
const ENTERED_VALUE = '1200'

export const Metric: Story = {
  args: {
    inputId: 'opening-width-o1',
    label: 'Width',
    valueMm: 900,
    preferences: DEFAULT_METRIC_PREFERENCES,
    assumeUnit: 'mm',
    onCommitMm: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const screen = within(canvasElement)

    // The label spells out the assumed unit, so the metric field reads "Width (mm)".
    const input = screen.getByLabelText('Width (mm)')
    await userEvent.clear(input)
    await userEvent.type(input, `${ENTERED_VALUE}{Enter}`)

    await expect(args.onCommitMm).toHaveBeenCalledTimes(1)
    await expect(args.onCommitMm).toHaveBeenCalledWith(1200)
  },
}
