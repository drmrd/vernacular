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
  tags: ['autodocs'],
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

const SWATCH_NAMES = [
  '--vellum-50',
  '--vellum-100',
  '--vellum-200',
  '--vellum-300',
  '--umber-900',
  '--umber-700',
  '--umber-500',
  '--ink-950',
  '--ink-900',
  '--ink-800',
  '--ink-600',
  '--brass-500',
  '--brass-600',
  '--brass-300',
]

const SEMANTIC_ROWS = [
  { token: '--color-text', alias: '--umber-900' },
  { token: '--color-text-muted', alias: '--umber-500' },
  { token: '--color-surface', alias: '--vellum-100' },
  { token: '--color-surface-raised', alias: '--vellum-50' },
  { token: '--color-surface-active', alias: '--vellum-200' },
  { token: '--color-border', alias: '--vellum-300' },
  { token: '--color-accent', alias: '--brass-500' },
  { token: '--color-accent-strong', alias: '--brass-600' },
  { token: '--color-on-accent', alias: '--vellum-50' },
  { token: '--color-focus-ring', alias: '--ink-900' },
  { token: '--color-indicator', alias: '--brass-500' },
]

function DraughtsmansRestraintShowcase() {
  return (
    <Stack gap="space-5">
      <ThemeSwitcher />

      {/* Typography specimen */}
      <section>
        <p
          style={{
            margin: '0 0 8px',
            fontFamily: 'var(--font-family-ui)',
            fontSize: '0.68rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.09em',
            color: 'var(--color-text-muted)',
          }}
        >
          Typography
        </p>
        <p
          style={{
            margin: '0 0 4px',
            fontFamily: 'var(--font-family-heading)',
            fontSize: '1.1rem',
            fontWeight: 500,
            color: 'var(--color-text)',
          }}
        >
          Parlor restoration
        </p>
        <p
          style={{
            margin: '0 0 12px',
            fontFamily: 'var(--font-family-heading)',
            fontSize: '0.85rem',
            fontStyle: 'italic',
            color: 'var(--color-text-muted)',
          }}
        >
          American Farmhouse, c.1887
        </p>
        <p
          style={{
            margin: '0 0 4px',
            fontFamily: 'var(--font-family-ui)',
            fontSize: '0.85rem',
            color: 'var(--color-text)',
          }}
        >
          Property value at 0.85rem Inter 400
        </p>
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--font-family-mono)',
            fontSize: '0.8rem',
            color: 'var(--color-text)',
          }}
        >
          x 3.20 m{'  '}y 1.05 m
        </p>
      </section>

      {/* Primitive swatch ramp */}
      <section>
        <p
          style={{
            margin: '0 0 8px',
            fontFamily: 'var(--font-family-ui)',
            fontSize: '0.68rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.09em',
            color: 'var(--color-text-muted)',
          }}
        >
          Primitive ramp
        </p>
        {/*
          The design-system showcase reads raw primitive tokens directly to display
          the palette. Product component code references only semantic tokens.
        */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          {SWATCH_NAMES.map((name) => (
            <span
              key={name}
              title={name}
              aria-label={name}
              style={{
                display: 'inline-block',
                width: 'var(--space-5)',
                height: 'var(--space-5)',
                borderRadius: 'var(--radius-sm)',
                background: `var(${name})`,
                border: '1px solid var(--color-border)',
              }}
            />
          ))}
        </div>
      </section>

      {/* Semantic token table */}
      <section>
        <p
          style={{
            margin: '0 0 8px',
            fontFamily: 'var(--font-family-ui)',
            fontSize: '0.68rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.09em',
            color: 'var(--color-text-muted)',
          }}
        >
          Semantic tokens (light mode)
        </p>
        <table
          style={{
            borderCollapse: 'collapse',
            fontSize: '0.75rem',
            fontFamily: 'var(--font-family-mono)',
          }}
        >
          <tbody>
            {SEMANTIC_ROWS.map(({ token, alias }) => (
              <tr key={token}>
                <td style={{ padding: '2px 8px 2px 0', color: 'var(--color-text)' }}>{token}</td>
                <td style={{ padding: '2px 8px', color: 'var(--color-text-muted)' }}>{alias}</td>
                <td style={{ padding: '2px 0' }}>
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-block',
                      width: '1rem',
                      height: '1rem',
                      background: `var(${token})`,
                      border: '1px solid var(--color-border)',
                      borderRadius: '2px',
                      verticalAlign: 'middle',
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Component gallery */}
      <section>
        <p
          style={{
            margin: '0 0 8px',
            fontFamily: 'var(--font-family-ui)',
            fontSize: '0.68rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.09em',
            color: 'var(--color-text-muted)',
          }}
        >
          Component gallery
        </p>
        <Stack gap="space-3">
          {/* Buttons */}
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            <Button variant="primary">Export</Button>
            <Button>Neutral</Button>
            <Button disabled>Disabled</Button>
          </div>

          {/* Tool chips: active and inactive */}
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '4px 8px',
                background: 'var(--color-surface-active)',
                borderLeft: '2px solid var(--color-indicator)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-family-ui)',
                color: 'var(--color-text)',
              }}
            >
              Select (active)
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '4px 8px',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-family-ui)',
                color: 'var(--color-text-muted)',
              }}
            >
              Pan (inactive)
            </span>
          </div>

          {/* Period tag and era date tag */}
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            <span
              aria-label="period tag: Victorian"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '2px 8px',
                background: 'var(--brass-500)',
                color: 'var(--vellum-50)',
                borderRadius: '999px',
                fontSize: '0.65rem',
                fontFamily: 'var(--font-family-ui)',
                fontWeight: 600,
              }}
            >
              Victorian
            </span>
            <span
              aria-label="era date tag: c.1887"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '2px 8px',
                background: 'var(--vellum-200)',
                color: 'var(--umber-900)',
                border: '1px solid var(--brass-500)',
                borderRadius: '999px',
                fontSize: '0.65rem',
                fontFamily: 'var(--font-family-ui)',
              }}
            >
              c.1887
            </span>
          </div>
        </Stack>
      </section>
    </Stack>
  )
}

export const DraughtsmansRestraint: Story = {
  render: () => (
    <ThemeProvider>
      <DraughtsmansRestraintShowcase />
    </ThemeProvider>
  ),
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByText('Parlor restoration')).toBeInTheDocument()
    await expect(screen.getByLabelText('period tag: Victorian')).toBeInTheDocument()
    await expect(screen.getByText('Select (active)')).toBeInTheDocument()
  },
}
