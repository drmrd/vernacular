import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect } from 'storybook/test'
import {
  Button,
  EmptyState,
  LoadingState,
  Stack,
  ThemeProvider,
  useTheme,
  type ThemeChoice,
} from './index'

const meta: Meta = {
  title: 'Design System/Foundation',
}

export default meta
type Story = StoryObj

const CHOICES: ThemeChoice[] = ['light', 'dark', 'system']

function ThemeSwitcher() {
  const { choice, setChoice } = useTheme()
  return (
    <Stack direction="horizontal" gap="space-2">
      {CHOICES.map((option) => (
        <Button
          key={option}
          variant={option === choice ? 'primary' : 'neutral'}
          aria-pressed={option === choice}
          onClick={() => setChoice(option)}
        >
          {option}
        </Button>
      ))}
    </Stack>
  )
}

function Gallery() {
  const [count, setCount] = useState(0)
  return (
    <Stack gap="space-4">
      <ThemeSwitcher />
      <Stack direction="horizontal" gap="space-2">
        <Button variant="primary" onClick={() => setCount((value) => value + 1)}>
          Primary ({count})
        </Button>
        <Button>Neutral</Button>
        <Button disabled>Disabled</Button>
      </Stack>
      <LoadingState message="Loading project..." />
      <EmptyState
        title="No projects yet"
        description="Create one to begin."
        action={<Button variant="primary">New project</Button>}
      />
    </Stack>
  )
}

export const Foundation: Story = {
  render: () => (
    <ThemeProvider>
      <Gallery />
    </ThemeProvider>
  ),
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    // The primitives render and the primary button is reachable by role.
    await expect(screen.getByRole('button', { name: /Primary/ })).toBeInTheDocument()
    await expect(screen.getByRole('status')).toHaveTextContent('Loading project...')
    await expect(screen.getByRole('region', { name: 'No projects yet' })).toBeInTheDocument()
  },
}
