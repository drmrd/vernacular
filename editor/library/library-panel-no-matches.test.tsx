import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { AssetRegistry } from '../../storage'
import { AssetRegistryProvider } from '../../bridge/react/asset-registry-context'

import {
  MID_CENTURY_CHAIR_NAME,
  VICTORIAN_TABLE_NAME,
  searchBox,
  stockedRegistry,
} from './library-test-support'
import { LibraryPanel } from './library-panel'

const EMPTY_LIBRARY = 'Your library is empty'
const NO_MATCHES = 'No matches'
const CLEAR_FILTERS = /clear filters/i
const UNMATCHED_TERM = 'zzz'

function renderPanel(registry: AssetRegistry = stockedRegistry()): void {
  render(
    <AssetRegistryProvider registry={registry}>
      <LibraryPanel onPick={vi.fn()} onImport={vi.fn()} />
    </AssetRegistryProvider>,
  )
}

afterEach(cleanup)

describe('LibraryPanel with a filter that matches nothing', () => {
  it('names the active filters instead of leaving a bare gap', async () => {
    const user = userEvent.setup()
    renderPanel()
    await screen.findByRole('button', { name: MID_CENTURY_CHAIR_NAME })

    await user.type(searchBox(), UNMATCHED_TERM)

    expect(screen.getByRole('heading', { name: NO_MATCHES })).toBeInTheDocument()
    expect(screen.getByText(`Active filters: search "${UNMATCHED_TERM}"`)).toBeInTheDocument()
  })

  it('keeps the filter controls reachable so the search can be edited in place', async () => {
    const user = userEvent.setup()
    renderPanel()
    await screen.findByRole('button', { name: MID_CENTURY_CHAIR_NAME })

    await user.type(searchBox(), UNMATCHED_TERM)

    expect(searchBox()).toBeInTheDocument()
  })

  it('restores the whole library and empties the search when the clear action is used', async () => {
    const user = userEvent.setup()
    renderPanel()
    await screen.findByRole('button', { name: MID_CENTURY_CHAIR_NAME })
    await user.type(searchBox(), UNMATCHED_TERM)

    await user.click(screen.getByRole('button', { name: CLEAR_FILTERS }))

    expect(await screen.findByRole('button', { name: MID_CENTURY_CHAIR_NAME })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: VICTORIAN_TABLE_NAME })).toBeInTheDocument()
    expect(searchBox()).toHaveValue('')
  })

  it('names every active filter when a chip and the search rule each other out', async () => {
    const user = userEvent.setup()
    renderPanel()
    await screen.findByRole('button', { name: MID_CENTURY_CHAIR_NAME })

    await user.type(searchBox(), 'oak')
    await user.click(screen.getByRole('button', { name: 'mid-century' }))

    expect(screen.getByText('Active filters: search "oak", era mid-century')).toBeInTheDocument()
  })
})

describe('LibraryPanel with nothing in the library at all', () => {
  it('keeps the empty-library message and offers no filters to clear', async () => {
    renderPanel(new AssetRegistry([]))

    expect(await screen.findByRole('heading', { name: EMPTY_LIBRARY })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: CLEAR_FILTERS })).toBeNull()
  })
})
