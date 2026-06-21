import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent } from 'storybook/test'
import { AssetRegistry, PackSource, createFetchPackReader } from '../../storage'
import { AssetRegistryProvider } from '../../bridge/react/asset-registry-context'
import { packHandlers } from '../../storage/assets/msw-pack-handlers'
import { LibraryLauncher } from './library-launcher'

// LibraryLauncher is the docked disclosure for the furniture library: a trigger
// that toggles the LibraryPanel open, staying open while the user places items.
// The story mocks the pack manifest (ADR-0110) so opening the launcher lists a
// representative catalog without a real network read.
const BASE = '/packs/vernacular-starter-1.0.0'
const MID_CENTURY_CHAIR = 'Mid-century chair'

function fetchBackedRegistry(): AssetRegistry {
  return new AssetRegistry([
    {
      kind: 'pack',
      source: new PackSource(createFetchPackReader(BASE, globalThis.fetch.bind(globalThis))),
    },
  ])
}

const meta: Meta<typeof LibraryLauncher> = {
  title: 'Editor/Library Launcher',
  component: LibraryLauncher,
  tags: ['autodocs'],
  render: () => (
    <AssetRegistryProvider registry={fetchBackedRegistry()}>
      <LibraryLauncher onPick={() => {}} onImport={() => {}} />
    </AssetRegistryProvider>
  ),
}

export default meta

type Story = StoryObj<typeof LibraryLauncher>

export const Default: Story = {
  parameters: {
    msw: {
      handlers: packHandlers({
        base: BASE,
        assets: [{ contentHash: 'a'.repeat(64), name: MID_CENTURY_CHAIR }],
      }),
    },
  },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await userEvent.click(screen.getByRole('button', { name: 'Furniture' }))
    await expect(await screen.findByRole('button', { name: MID_CENTURY_CHAIR })).toBeInTheDocument()
  },
}
