import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent, fn } from 'storybook/test'
import { DEFAULT_ENVIRONMENT_STATE, type EnvironmentState, type Site } from '../../core'
import { EnvironmentPanel } from './environment-panel'

const SITE_WITH_TIMEZONE: Site = {
  latLong: { latitude: 42.36, longitude: -71.06 },
  timezone: 'America/New_York',
}

const SITE_WITHOUT_TIMEZONE: Site = {
  latLong: { latitude: 42.36, longitude: -71.06 },
}

const REALISTIC: EnvironmentState = { ...DEFAULT_ENVIRONMENT_STATE, mode: 'realistic' }

const meta: Meta<typeof EnvironmentPanel> = {
  title: 'Editor/EnvironmentPanel',
  component: EnvironmentPanel,
  tags: ['autodocs'],
  args: {
    site: SITE_WITH_TIMEZONE,
    environment: DEFAULT_ENVIRONMENT_STATE,
    onEnvironmentChange: fn(),
  },
}

export default meta

type Story = StoryObj<typeof EnvironmentPanel>

export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    const screen = within(canvasElement)
    await userEvent.click(screen.getByRole('button', { name: 'Realistic' }))
    await expect(args.onEnvironmentChange).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'realistic' }),
    )
  },
}

export const MissingLocation: Story = {
  args: { site: undefined, environment: REALISTIC },
}

export const MissingTimezone: Story = {
  args: { site: SITE_WITHOUT_TIMEZONE, environment: REALISTIC },
}
