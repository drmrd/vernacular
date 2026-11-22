import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { DEFAULT_ENVIRONMENT_STATE, type EnvironmentState } from '../../core'
import { OpeningLightControl } from './opening-light-control'

const MORNING_MINUTES = 480
const PARTLY_CLOUDY = 0.4

const MORNING_ENVIRONMENT: EnvironmentState = {
  ...DEFAULT_ENVIRONMENT_STATE,
  observedAt: { date: '2026-06-21', minutesSinceMidnight: MORNING_MINUTES },
  cloudCover: PARTLY_CLOUDY,
}

const meta: Meta<typeof OpeningLightControl> = {
  title: 'Editor/OpeningLightControl',
  component: OpeningLightControl,
  tags: ['autodocs'],
  args: {
    environment: MORNING_ENVIRONMENT,
    openingLight: undefined,
    dispatch: fn(),
  },
}

export default meta

type Story = StoryObj<typeof OpeningLightControl>

export const Default: Story = {}

export const Stored: Story = {
  args: {
    openingLight: { observedAt: '2026-06-21T08:00', weather: { cloudCover: PARTLY_CLOUDY } },
  },
}
