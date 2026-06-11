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

function DraftingTableShowcase() {
  return (
    <Stack gap="space-4">
      <ThemeSwitcher />
      <h2 style={{ margin: 0, fontFamily: 'var(--font-family-heading)' }}>Parlor restoration</h2>
      <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>
        A warm vellum canvas with ink-blue chrome.
      </p>
      <div
        style={{
          padding: 'var(--space-4)',
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--elevation-raised)',
        }}
      >
        {/* A representative coordinate readout, not live data, to show the mono token. */}
        <p style={{ margin: 0, fontFamily: 'var(--font-family-mono)' }}>x 3.20 m y 1.05 m</p>
      </div>
      {/*
        This showcase is the design system's own gallery, so it deliberately reads
        the raw material-accent primitives by name to display the palette. Product
        component code must still reference only semantic tokens (the contract).
      */}
      <Stack direction="horizontal" gap="space-2">
        {['--brass-500', '--clay-500', '--sage-500', '--ink-900'].map((swatch) => (
          <span
            key={swatch}
            aria-hidden="true"
            style={{
              width: 'var(--space-5)',
              height: 'var(--space-5)',
              borderRadius: 'var(--radius-sm)',
              background: `var(${swatch})`,
            }}
          />
        ))}
      </Stack>
    </Stack>
  )
}

export const DraftingTable: Story = {
  render: () => (
    <ThemeProvider>
      <DraftingTableShowcase />
    </ThemeProvider>
  ),
}
