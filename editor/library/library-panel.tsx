import { useEffect, useState, type ReactElement } from 'react'

import { formatAssetReference } from '../../core'
import type { AssetRegistry, LibraryItem } from '../../storage'
import { useAssetRegistry } from '../../bridge/react/asset-registry-context'

import {
  DEFAULT_FILTERS,
  distinctEras,
  nextEra,
  visibleLibraryItems,
  type LibraryFilters,
  type SourceFilter,
} from './library-filter'

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

const SOURCE_OPTIONS: ReadonlyArray<{ value: SourceFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'sample', label: 'Sample' },
  { value: 'yours', label: 'Yours' },
]

interface LibraryControlsProps {
  filters: LibraryFilters
  eras: string[]
  setFilters: (filters: LibraryFilters) => void
}

function SourceToggle({ filters, setFilters }: LibraryControlsProps): ReactElement {
  return (
    <div className="library-panel__sources" role="group" aria-label="Source">
      {SOURCE_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={filters.source === option.value}
          onClick={() => setFilters({ ...filters, source: option.value })}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function EraChips({ filters, eras, setFilters }: LibraryControlsProps): ReactElement {
  return (
    <div className="library-panel__eras" role="group" aria-label="Era">
      {eras.map((era) => (
        <button
          key={era}
          type="button"
          aria-pressed={filters.era === era}
          onClick={() => setFilters({ ...filters, era: nextEra(filters.era, era) })}
        >
          {era}
        </button>
      ))}
    </div>
  )
}

// Search box, source toggle, and era chips that drive the visible-item filter.
function LibraryControls(props: LibraryControlsProps): ReactElement {
  const { filters, setFilters } = props
  return (
    <div className="library-panel__controls">
      <input
        type="search"
        aria-label="Search furniture"
        value={filters.query}
        onChange={(event) => setFilters({ ...filters, query: event.target.value })}
      />
      <SourceToggle {...props} />
      <EraChips {...props} />
    </div>
  )
}

interface LibraryBodyProps {
  items: LibraryItem[] | null
  onPick: (item: LibraryItem) => void
}

// Pick the body to render: nothing while loading, the empty message when there
// are no items, otherwise the filter controls above the matching grid.
function LibraryBody({ items, onPick }: LibraryBodyProps): ReactElement | null {
  const [filters, setFilters] = useState<LibraryFilters>(DEFAULT_FILTERS)
  if (items === null) {
    return null
  }
  if (items.length === 0) {
    return <p className="library-panel__empty">{EMPTY_MESSAGE}</p>
  }
  return (
    <>
      <LibraryControls filters={filters} eras={distinctEras(items)} setFilters={setFilters} />
      <LibraryGrid items={visibleLibraryItems(items, filters)} onPick={onPick} />
    </>
  )
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
