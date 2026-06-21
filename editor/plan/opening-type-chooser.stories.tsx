import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent } from 'storybook/test'
import { OpeningToolProvider } from './opening-tool-context'
import { OpeningTypeChooser } from './opening-type-chooser'

const meta: Meta<typeof OpeningTypeChooser> = {
  title: 'Editor/OpeningTypeChooser',
  component: OpeningTypeChooser,
  tags: ['autodocs'],
  // The chooser reads and writes the shared place-opening placement type, so it
  // is wrapped in the opening-tool provider that backs that context.
  decorators: [(story) => <OpeningToolProvider>{story()}</OpeningToolProvider>],
}

export default meta

type Story = StoryObj<typeof OpeningTypeChooser>

const DEFAULT_TYPE = 'single-swing-door'
const CHOSEN_TYPE = 'double-swing-door'

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)

    // The chooser seeds at the default placement type drawn from the provider.
    const select = screen.getByRole('combobox', { name: /opening type/i })
    await expect(select).toHaveValue(DEFAULT_TYPE)

    // Picking another type writes it back through the provider, so the controlled
    // select reflects the new placement type.
    await userEvent.selectOptions(select, CHOSEN_TYPE)
    await expect(select).toHaveValue(CHOSEN_TYPE)
  },
}
