import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent } from 'storybook/test'
import { Segmented } from './index'

const meta: Meta<typeof Segmented> = {
  title: 'Design System/Segmented',
  component: Segmented,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof Segmented>

const OPTIONS = [
  { value: 'one', label: 'One' },
  { value: 'two', label: 'Two' },
  { value: 'three', label: 'Three' },
]

function SegmentedController() {
  const [value, setValue] = useState('one')
  return <Segmented value={value} options={OPTIONS} onSelect={setValue} />
}

export const Default: Story = {
  render: () => <SegmentedController />,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByRole('button', { name: 'One', pressed: true })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Two' }))
    await expect(
      await screen.findByRole('button', { name: 'Two', pressed: true }),
    ).toBeInTheDocument()
  },
}
