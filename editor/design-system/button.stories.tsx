import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent } from 'storybook/test'
import { Button } from './index'

const meta: Meta<typeof Button> = {
  title: 'Design System/Button',
  component: Button,
}

export default meta

type Story = StoryObj<typeof Button>

export const Default: Story = {
  render: () => <Button>Save</Button>,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  },
}

function Counter() {
  const [count, setCount] = useState(0)
  return <Button onClick={() => setCount((value) => value + 1)}>Count: {count}</Button>
}

export const Clicking: Story = {
  render: () => <Counter />,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    const button = screen.getByRole('button', { name: 'Count: 0' })
    await userEvent.click(button)
    await userEvent.click(button)
    await expect(await screen.findByText('Count: 2')).toBeInTheDocument()
  },
}
