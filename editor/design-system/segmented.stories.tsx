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

// A second option carries the transient preview outline while the first stays
// selected, so the previewed and pressed states are visibly distinct side by side.
export const Previewed: Story = {
  render: () => <Segmented value="one" previewValue="two" options={OPTIONS} onSelect={() => {}} />,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    const previewed = screen.getByRole('button', { name: 'Two' })
    await expect(previewed).toHaveClass('is-preview')
    await expect(previewed).toHaveAttribute('aria-pressed', 'false')
    await expect(screen.getByRole('button', { name: 'One', pressed: true })).toBeInTheDocument()
  },
}
