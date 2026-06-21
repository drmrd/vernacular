import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent, fn } from 'storybook/test'
import type { Site } from '../../core'
import { SiteEditor } from './site-editor'

const SITE: Site = { latLong: { latitude: 42.36, longitude: -71.06 } }

const meta: Meta<typeof SiteEditor> = {
  title: 'Editor/SiteEditor',
  component: SiteEditor,
  tags: ['autodocs'],
  args: {
    site: SITE,
    dispatch: fn(),
  },
}

export default meta

type Story = StoryObj<typeof SiteEditor>

export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    const screen = within(canvasElement)
    const latitude = screen.getByLabelText(/latitude/i)
    await expect(latitude).toHaveValue(42.36)
    await userEvent.clear(latitude)
    await userEvent.type(latitude, '40{Enter}')
    await expect(args.dispatch).toHaveBeenCalled()
  },
}
