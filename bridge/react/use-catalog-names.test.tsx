import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import type { AssetSource, LibraryItem } from '../../storage'
import { AssetRegistry } from '../../storage'
import { useCatalogNames } from './use-catalog-names'
import { AssetRegistryProvider } from './asset-registry-context'

afterEach(cleanup)

// A minimal library item for a stubbed asset source: only the fields the catalog-names
// lookup and its type require, keyed by the content hash callers resolve against.
function libraryItem(contentHash: string, name: string): LibraryItem {
  return {
    reference: { scope: 'project', contentHash },
    name,
    kind: 'furniture',
    categories: [],
    eras: [],
    footprint: { width: 600, depth: 600 },
    height: 900,
  }
}

// Reports the hook's return value on every render, so a test can observe it settle
// from its initial empty map to the populated one once the registry's catalog() resolves.
function CatalogNamesProbe({ onNames }: { onNames: (names: ReadonlyMap<string, string>) => void }) {
  onNames(useCatalogNames())
  return null
}

describe('resolving catalog display names from the asset registry', () => {
  it('starts empty and settles to the registry catalog once the catalog read resolves', async () => {
    const stubSource: AssetSource = {
      id: 'stub-source',
      read: async () => undefined,
      list: async () => [
        libraryItem('hash-armchair', 'Wingback Armchair'),
        libraryItem('hash-settee', 'Camelback Settee'),
      ],
    }
    const registry = new AssetRegistry([{ kind: 'project', source: stubSource }])

    let captured: ReadonlyMap<string, string> | undefined
    render(
      <AssetRegistryProvider registry={registry}>
        <CatalogNamesProbe
          onNames={(names) => {
            captured = names
          }}
        />
      </AssetRegistryProvider>,
    )

    // The first synchronous render happens before the catalog read has had a chance to resolve.
    expect(captured?.size).toBe(0)

    await waitFor(() => expect(captured?.size).toBe(2))
    expect(captured?.get('hash-armchair')).toBe('Wingback Armchair')
    expect(captured?.get('hash-settee')).toBe('Camelback Settee')
  })

  it('names an item from an unlisted source', async () => {
    const unlistedSource: AssetSource = {
      id: 'retired-pack',
      read: async () => undefined,
      list: async () => [libraryItem('hash-old-chair', 'Starter Chair')],
    }
    const registry = new AssetRegistry([{ kind: 'project', source: unlistedSource, listed: false }])

    let captured: ReadonlyMap<string, string> | undefined
    render(
      <AssetRegistryProvider registry={registry}>
        <CatalogNamesProbe
          onNames={(names) => {
            captured = names
          }}
        />
      </AssetRegistryProvider>,
    )

    await waitFor(() => expect(captured?.get('hash-old-chair')).toBe('Starter Chair'))
  })
})
