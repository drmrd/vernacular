import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect } from 'storybook/test'
import { AppFrame } from './index'

// AppFrame is the editor's top-level layout: a banner header, a collapsible tool
// rail, the main plan area, a collapsible inspector, and an optional status bar.
// The story fills each region with placeholder content so the frame's landmarks
// and spacing read in isolation.
const meta: Meta<typeof AppFrame> = {
  title: 'Design System/AppFrame',
  component: AppFrame,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof AppFrame>

export const Default: Story = {
  render: () => (
    <AppFrame
      header={<strong>Vernacular</strong>}
      rail={<button type="button">Wall</button>}
      railLabel="Tools"
      main={<p>Plan canvas</p>}
      mainLabel="Plan"
      inspector={<p>Nothing selected</p>}
      inspectorLabel="Properties"
      statusBar={<span>Ready</span>}
    />
  ),
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    // The header banner and the main plan region anchor the layout at every
    // breakpoint, so they are the stable landmarks to assert on.
    await expect(screen.getByRole('banner')).toBeInTheDocument()
    await expect(screen.getByRole('main', { name: 'Plan' })).toBeInTheDocument()
    await expect(screen.getByText('Vernacular')).toBeInTheDocument()
  },
}
