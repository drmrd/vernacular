import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, fn } from 'storybook/test'
import { ImportDropTarget } from './import-drop-target'

const meta: Meta<typeof ImportDropTarget> = {
  title: 'Editor/ImportDropTarget',
  component: ImportDropTarget,
  tags: ['autodocs'],
  args: {
    onImportDroppedFile: fn(),
    children: (
      <div style={{ padding: '2rem', border: '1px dashed currentColor' }}>
        Drag a project file onto the viewport to open it.
      </div>
    ),
  },
}

export default meta

type Story = StoryObj<typeof ImportDropTarget>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByTestId('import-drop-target')).toBeInTheDocument()
    await expect(screen.getByText(/Drag a project file/)).toBeInTheDocument()
  },
}
