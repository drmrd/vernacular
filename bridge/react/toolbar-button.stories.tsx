import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect } from 'storybook/test'
import { ToolbarButton } from './toolbar-button'
import './scene-nav-toolbar.css'

const meta: Meta<typeof ToolbarButton> = {
  title: 'Bridge/ToolbarButton',
  component: ToolbarButton,
  tags: ['autodocs'],
  args: {
    label: 'Top down',
    onActivate: () => {},
  },
}

export default meta

type Story = StoryObj<typeof ToolbarButton>

const UNAVAILABLE_REASON =
  'Poses the orbit camera. Walk mode would overwrite the pose on the next frame.'

export const Available: Story = {
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Top down' })
    await expect(button).not.toHaveAttribute('aria-disabled')
  },
}

export const Unavailable: Story = {
  args: { unavailableReason: UNAVAILABLE_REASON },
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Top down' })
    await expect(button).toHaveAttribute('aria-disabled', 'true')
    button.focus()
    await expect(button).toHaveFocus()
    await expect(button).toHaveAccessibleDescription(UNAVAILABLE_REASON)
  },
}

export const Pressed: Story = {
  args: { label: 'Select', pressed: true },
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Select' })
    await expect(button).toHaveAttribute('aria-pressed', 'true')
  },
}
