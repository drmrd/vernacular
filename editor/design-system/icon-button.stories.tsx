import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect } from 'storybook/test'
import { IconButton } from './index'
import { expectArrisWrapper } from './arris-story-support'

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

// An unpressed instance beside a pressed one. The two carry distinct
// accessible names (rather than sharing "Zoom in") so a11y tooling does not
// flag adjacent controls with a duplicate name.
function ArrisIconButtonStates() {
  return (
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      <IconButton aria-label="Zoom in">+</IconButton>
      <IconButton aria-label="Zoom in (pressed)" aria-pressed>
        +
      </IconButton>
    </div>
  )
}

async function playArrisIconButtonStates(canvasElement: HTMLElement) {
  await expectArrisWrapper(canvasElement)
  const screen = within(canvasElement)
  await expect(
    screen.getByRole('button', { name: 'Zoom in (pressed)', pressed: true }),
  ).toBeInTheDocument()
}

export const ArrisLight: Story = {
  globals: { designLanguage: 'arris', appearance: 'light' },
  render: () => <ArrisIconButtonStates />,
  play: async ({ canvasElement }) => playArrisIconButtonStates(canvasElement),
}

export const ArrisDark: Story = {
  globals: { designLanguage: 'arris', appearance: 'dark' },
  render: () => <ArrisIconButtonStates />,
  play: async ({ canvasElement }) => playArrisIconButtonStates(canvasElement),
}
