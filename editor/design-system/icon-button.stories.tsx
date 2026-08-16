import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect } from 'storybook/test'
import { IconButton } from './index'

const meta: Meta<typeof IconButton> = {
  title: 'Design System/IconButton',
  component: IconButton,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof IconButton>

export const Default: Story = {
  render: () => <IconButton aria-label="Zoom in">+</IconButton>,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByRole('button', { name: 'Zoom in' })).toBeInTheDocument()
  },
}

export const Labeled: Story = {
  render: () => <IconButton labeled>Imperial</IconButton>,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByRole('button', { name: 'Imperial' })).toBeInTheDocument()
  },
}

// A compact, static states sheet for the Arris visual tier: an unpressed and a
// pressed instance side by side, so a single frame captures both states.
function ArrisIconButtonStates() {
  return (
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      <IconButton aria-label="Zoom in">+</IconButton>
      <IconButton aria-label="Zoom in" aria-pressed>
        +
      </IconButton>
    </div>
  )
}

async function expectArrisWrapper(canvasElement: HTMLElement) {
  const wrapper = canvasElement.querySelector('[data-design-language="arris"]')
  await expect(wrapper).toBeInTheDocument()
}

export const ArrisLight: Story = {
  globals: { designLanguage: 'arris', appearance: 'light' },
  render: () => <ArrisIconButtonStates />,
  play: async ({ canvasElement }) => expectArrisWrapper(canvasElement),
}

export const ArrisDark: Story = {
  globals: { designLanguage: 'arris', appearance: 'dark' },
  render: () => <ArrisIconButtonStates />,
  play: async ({ canvasElement }) => expectArrisWrapper(canvasElement),
}
