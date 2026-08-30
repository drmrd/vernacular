import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent } from 'storybook/test'
import { Button } from './index'
import { expectArrisWrapper } from './arris-story-support'

const meta: Meta<typeof Button> = {
  title: 'Design System/Button',
  component: Button,
  tags: ['autodocs'],
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

// This story opts into the accessibility gate: parameters.a11y.test = 'error'
// makes the addon-a11y axe-core pass fail the browser-mode component test on any
// violation. The button carries a clear text label, so it has an accessible name
// and reports no violations, proving the gate participates in the test run.
export const AccessibilityGate: Story = {
  parameters: {
    a11y: { test: 'error' },
  },
  render: () => <Button>Open project</Button>,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByRole('button', { name: 'Open project' })).toBeInTheDocument()
  },
}

// A default button beside a disabled one. Hover and active need a pointer held in
// place, which a static states sheet cannot capture, so these are the two states
// left to compare here.
function ArrisButtonStates() {
  return (
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      <Button>Save</Button>
      <Button disabled>Save</Button>
    </div>
  )
}

async function playArrisButtonStates(canvasElement: HTMLElement) {
  await expectArrisWrapper(canvasElement)
  const screen = within(canvasElement)
  await expect(screen.getAllByRole('button', { name: 'Save' })[1]).toBeDisabled()
}

export const ArrisLight: Story = {
  globals: { designLanguage: 'arris', appearance: 'light' },
  render: () => <ArrisButtonStates />,
  play: async ({ canvasElement }) => playArrisButtonStates(canvasElement),
}

export const ArrisDark: Story = {
  globals: { designLanguage: 'arris', appearance: 'dark' },
  render: () => <ArrisButtonStates />,
  play: async ({ canvasElement }) => playArrisButtonStates(canvasElement),
}
