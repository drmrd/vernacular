import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent, fn } from 'storybook/test'
import { DEFAULT_ENVIRONMENT_STATE, type EnvironmentScene } from '../../core'
import { EnvironmentScenes } from './environment-scenes'

const SAVED_SCENES: EnvironmentScene[] = [
  {
    id: 'winter-dusk',
    name: 'Winter dusk',
    observedAt: '2026-12-04T16:00',
    weather: { cloudCover: 0.6 },
  },
  {
    id: 'summer-noon',
    name: 'Summer noon',
    observedAt: '2026-06-21T12:00',
    weather: { cloudCover: 0.1 },
  },
]

const meta: Meta<typeof EnvironmentScenes> = {
  title: 'Editor/EnvironmentScenes',
  component: EnvironmentScenes,
  tags: ['autodocs'],
  args: {
    scenes: SAVED_SCENES,
    environment: DEFAULT_ENVIRONMENT_STATE,
    onEnvironmentChange: fn(),
    dispatch: fn(),
  },
}

export default meta

type Story = StoryObj<typeof EnvironmentScenes>

export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    const screen = within(canvasElement)
    await userEvent.type(screen.getByLabelText(/scene name/i), 'Overcast morning')
    await userEvent.click(screen.getByRole('button', { name: 'Save scene' }))
    await expect(args.dispatch).toHaveBeenCalled()
  },
}

export const Empty: Story = {
  args: { scenes: [] },
}
