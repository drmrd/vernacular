import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect } from 'storybook/test'
import { AssetRegistry, PackSource, createFetchPackReader } from '../../storage'
import { AssetRegistryProvider } from '../../bridge/react/asset-registry-context'
import { packHandlers, packErrorHandlers } from '../../storage/assets/msw-pack-handlers'
import { LibraryPanel } from './library-panel'

// A relative pack base: the browser-mode MSW worker resolves it against the
// Storybook iframe origin and intercepts the manifest request, so no real
// network or on-disk pack is read during the story.
const BASE = '/packs/vernacular-starter-1.0.0'

const EMPTY_STATE = 'No furniture to show yet. Import a model to add your own.'

const MID_CENTURY_CHAIR = 'Mid-century chair'
const EDWARDIAN_DESK = 'Edwardian writing desk'

function fetchBackedRegistry(): AssetRegistry {
  return new AssetRegistry([
    {
      kind: 'pack',
      source: new PackSource(createFetchPackReader(BASE, globalThis.fetch.bind(globalThis))),
    },
  ])
}

const meta: Meta<typeof LibraryPanel> = {
  title: 'Editor/Library Panel',
  component: LibraryPanel,
  tags: ['autodocs'],
  render: () => (
    <AssetRegistryProvider registry={fetchBackedRegistry()}>
      <LibraryPanel onPick={() => {}} onImport={() => {}} />
    </AssetRegistryProvider>
  ),
}

export default meta

type Story = StoryObj<typeof LibraryPanel>

// The on-disk manifest carries a single asset named 'Example chair', so two
// differently named buttons can only come from the mocked response: proof the
// MSW worker served the manifest with no real network read.
export const Success: Story = {
  parameters: {
    msw: {
      handlers: packHandlers({
        base: BASE,
        assets: [
          { contentHash: 'a'.repeat(64), name: MID_CENTURY_CHAIR },
          { contentHash: 'b'.repeat(64), name: EDWARDIAN_DESK },
        ],
      }),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('button', { name: MID_CENTURY_CHAIR })).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: EDWARDIAN_DESK })).toBeInTheDocument()
  },
}

export const Empty: Story = {
  parameters: {
    msw: {
      handlers: packHandlers({ base: BASE, assets: [] }),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText(EMPTY_STATE)).toBeInTheDocument()
    expect(canvas.queryByRole('button', { name: MID_CENTURY_CHAIR })).toBeNull()
  },
}

// A 500 manifest response degrades to the same empty state: the fetch-backed
// reader maps any non-ok manifest to an empty pack rather than throwing.
export const Error: Story = {
  parameters: {
    msw: {
      handlers: packErrorHandlers({ base: BASE }),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText(EMPTY_STATE)).toBeInTheDocument()
  },
}
