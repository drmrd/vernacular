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
