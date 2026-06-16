import { useEffect, useState, type ReactElement } from 'react'

import { formatAssetReference } from '../../core'
import type { LibraryItem } from '../../storage'
import type { AssetRegistry } from '../../storage'
import { useAssetRegistry } from '../../bridge/react/asset-registry-context'

import './library-panel.css'

export interface LibraryPanelProps {
  onPick: (item: LibraryItem) => void
  onImport: () => void
}

// Load the registry's library items once, guarding against a state update after
// the panel unmounts. A null result marks the still-loading state.
function useLibraryItems(registry: AssetRegistry): LibraryItem[] | null {
  const [items, setItems] = useState<LibraryItem[] | null>(null)
  useEffect(() => {
    let cancelled = false
    void registry.list().then((listed) => {
      if (!cancelled) {
        setItems(listed)
      }
    })
    return () => {
      cancelled = true
    }
  }, [registry])
  return items
}

const EMPTY_MESSAGE = 'No furniture to show yet. Import a model to add your own.'

interface LibraryGridProps {
  items: LibraryItem[]
  onPick: (item: LibraryItem) => void
}

// One pickable button per library item, keyed by its content-addressed reference.
function LibraryGrid({ items, onPick }: LibraryGridProps): ReactElement {
  return (
    <ul className="library-panel__grid">
      {items.map((item, index) => (
        <li
          key={`${formatAssetReference(item.reference)}:${index}`}
          className="library-panel__cell"
        >
          <button type="button" onClick={() => onPick(item)}>
            {item.name}
          </button>
        </li>
      ))}
    </ul>
  )
}

interface LibraryBodyProps {
  items: LibraryItem[] | null
  onPick: (item: LibraryItem) => void
}

// Pick the body to render: nothing while loading, the empty message when there
// are no items, otherwise the grid.
function LibraryBody({ items, onPick }: LibraryBodyProps): ReactElement | null {
  if (items === null) {
    return null
  }
  if (items.length === 0) {
    return <p className="library-panel__empty">{EMPTY_MESSAGE}</p>
  }
  return <LibraryGrid items={items} onPick={onPick} />
}

export function LibraryPanel(props: LibraryPanelProps): ReactElement {
  const { onPick, onImport } = props
  const registry = useAssetRegistry()
  const items = useLibraryItems(registry)
  return (
    <section className="library-panel" aria-label="Furniture library">
      <button type="button" className="library-panel__import" onClick={onImport}>
        Import GLB
      </button>
      <LibraryBody items={items} onPick={onPick} />
    </section>
  )
}
