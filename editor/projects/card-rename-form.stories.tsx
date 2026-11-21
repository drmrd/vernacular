import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, fn } from 'storybook/test'
import { CardRenameForm } from './card-rename-form'

const meta: Meta<typeof CardRenameForm> = {
  title: 'Editor/CardRenameForm',
  component: CardRenameForm,
  tags: ['autodocs'],
  args: {
    name: 'Hubbard House',
    onSave: fn(() => Promise.resolve(true)),
    onCancel: fn(),
  },
}

export default meta

type Story = StoryObj<typeof CardRenameForm>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByRole('textbox', { name: 'Project name' })).toHaveValue('Hubbard House')
    await expect(screen.getByRole('button', { name: 'Save name' })).toBeInTheDocument()
    await expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  },
}
