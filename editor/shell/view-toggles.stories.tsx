import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent } from 'storybook/test'
import { ViewModeProvider } from '../viewport/view-mode'
import { ViewOverlayProvider } from '../viewport/view-overlay-context'
import { ViewToggles } from './view-toggles'

// The toggles read the shared view-overlay state and the active view mode, so each
// story supplies both contexts and picks the view mode it wants to show.
const meta: Meta<typeof ViewToggles> = {
  title: 'Editor/ViewToggles',
  component: ViewToggles,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof ViewToggles>

export const OverThePlan: Story = {
  render: () => (
    <ViewModeProvider initial="plan">
      <ViewOverlayProvider>
        <ViewToggles />
      </ViewOverlayProvider>
    </ViewModeProvider>
  ),
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    const grid = screen.getByRole('button', { name: 'Grid' })
    await expect(grid).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(grid)
    await expect(grid).toHaveAttribute('aria-pressed', 'false')
  },
}

// The 3D-only mode shows no plan, so both toggles go inert and explain themselves.
export const InertInTheThreeDimensionalView: Story = {
  render: () => (
    <ViewModeProvider initial="preview">
      <ViewOverlayProvider>
        <ViewToggles />
      </ViewOverlayProvider>
    </ViewModeProvider>
  ),
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByRole('button', { name: 'Grid' })).toBeDisabled()
    await expect(screen.getByRole('button', { name: 'Dimensions' })).toBeDisabled()
  },
}
