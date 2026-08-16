import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect } from 'storybook/test'
import { Field } from './index'

const meta: Meta<typeof Field> = {
  title: 'Design System/Field',
  component: Field,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof Field>

export const Default: Story = {
  render: () => (
    <Field htmlFor="project-name" label="Project name">
      <input id="project-name" />
    </Field>
  ),
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByLabelText('Project name')).toBeInTheDocument()
  },
}

export const WithHint: Story = {
  render: () => (
    <Field htmlFor="email" label="Email" hint="We never share it">
      <input id="email" />
    </Field>
  ),
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('We never share it')
  },
}

// A compact, static states sheet for the Arris visual tier: a filled field
// beside a disabled one, so a single frame captures both states. Field's
// public props expose no invalid state, so this sheet omits one.
function ArrisFieldStates() {
  return (
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      <Field htmlFor="arris-project-name" label="Project name">
        <input id="arris-project-name" defaultValue="Maple Street" />
      </Field>
      <Field htmlFor="arris-email" label="Email">
        <input id="arris-email" disabled defaultValue="closed@example.com" />
      </Field>
    </div>
  )
}

async function expectArrisWrapper(canvasElement: HTMLElement) {
  const wrapper = canvasElement.querySelector('[data-design-language="arris"]')
  await expect(wrapper).toBeInTheDocument()
}

export const ArrisLight: Story = {
  globals: { designLanguage: 'arris', appearance: 'light' },
  render: () => <ArrisFieldStates />,
  play: async ({ canvasElement }) => expectArrisWrapper(canvasElement),
}

export const ArrisDark: Story = {
  globals: { designLanguage: 'arris', appearance: 'dark' },
  render: () => <ArrisFieldStates />,
  play: async ({ canvasElement }) => expectArrisWrapper(canvasElement),
}
