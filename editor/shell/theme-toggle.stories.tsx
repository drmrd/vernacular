import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent } from 'storybook/test'
import { ThemeProvider } from '../design-system'
import { ThemeToggle } from './theme-toggle'

// ThemeToggle reads the theme choice through useTheme, so the story wraps it in a
// ThemeProvider to supply that context in isolation.
const meta: Meta<typeof ThemeToggle> = {
  title: 'Editor/ThemeToggle',
  component: ThemeToggle,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof ThemeToggle>

export const Default: Story = {
  render: () => (
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>
  ),
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByRole('button', { name: 'System', pressed: true })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Light' }))
    await expect(
      await screen.findByRole('button', { name: 'Light', pressed: true }),
    ).toBeInTheDocument()
  },
}
