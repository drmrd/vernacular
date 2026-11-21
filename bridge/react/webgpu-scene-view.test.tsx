import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import type { FurnitureSceneNode, SceneGraph } from '../../core'
import type { AssetSource, LibraryItem } from '../../storage'
import { AssetRegistry } from '../../storage'
import { createSelectionStore } from '../selection/selection-store'
import { AssetRegistryProvider } from './asset-registry-context'
import { SelectionProvider } from './selection-provider'
import { useSceneProxies } from './use-scene-proxies'

afterEach(cleanup)

const FURNITURE_ID = 'furniture:unnamed-armchair'

// A single unnamed furniture piece referencing a catalog asset by content hash, the same
// minimal shape the entity-labels fixtures use since only `id` and `assetRef` drive
// this test.
function furnitureFromCatalog(id: string, contentHash: string): FurnitureSceneNode {
  return {
    id,
    kind: 'furniture',
    floorId: 'demo',
    footprintCorners: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
    elevationZ: 0,
    height: 800,
    assetRef: { scope: 'project', contentHash },
  }
}

const graph: SceneGraph = {
  nodes: [{ id: 'floor:demo', kind: 'floor', name: 'Demo', elevation: 0 }],
  walls: [],
  rooms: [],
  underlays: [],
  openings: [],
  dimensions: [],
  stairs: [],
  furniture: [furnitureFromCatalog(FURNITURE_ID, 'hash-armchair')],
}

// A minimal library item for a stubbed asset source, the same shape the catalog names
// hook tests use, keyed by the content hash the hook resolves against.
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

// Reports the hook's proxies on every render and injects one fixed screen position, so
// a test can observe the joined proxy label settle from its positional fallback to the
// catalog name once the registry's list() resolves.
function SceneProxiesProbe({
  onProxies,
}: {
  onProxies: (proxies: { id: string; x: number; y: number; label: string }[]) => void
}) {
  const { proxies, setPositions } = useSceneProxies(graph)
  onProxies(proxies)
  useEffect(() => {
    setPositions([{ id: FURNITURE_ID, x: 5, y: 6 }])
  }, [setPositions])
  return null
}

// This test stays in this file on purpose: it imports AssetRegistry from storage, and the
// lint exception that allows that (eslint.config.js, issue 717) is keyed to this file name.
// Moving it would mean editing shared lint config.
describe('useSceneProxies', () => {
  it('joins injected screen positions with catalog-resolved labels', async () => {
    const stubSource: AssetSource = {
      id: 'stub-source',
      read: async () => undefined,
      list: async () => [libraryItem('hash-armchair', 'Wingback Armchair')],
    }
    const registry = new AssetRegistry([{ kind: 'project', source: stubSource }])
    const store = createSelectionStore()

    let captured: { id: string; x: number; y: number; label: string }[] = []
    render(
      <SelectionProvider store={store}>
        <AssetRegistryProvider registry={registry}>
          <SceneProxiesProbe
            onProxies={(proxies) => {
              captured = proxies
            }}
          />
        </AssetRegistryProvider>
      </SelectionProvider>,
    )

    // Before the registry's list() resolves, the joined proxy still carries the
    // positional fallback label.
    expect(captured.find((proxy) => proxy.id === FURNITURE_ID)?.label).toBe('Furniture 1')

    await waitFor(() =>
      expect(captured.find((proxy) => proxy.id === FURNITURE_ID)?.label).toBe(
        'Wingback Armchair 1',
      ),
    )
  })
})
