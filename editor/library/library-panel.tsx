import { useEffect, useState, type ReactElement } from 'react'

import { formatAssetReference } from '../../core'
import type { AssetRegistry, LibraryItem } from '../../storage'
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

type SourceFilter = 'all' | 'sample' | 'yours'

interface LibraryFilters {
  query: string
  source: SourceFilter
  era: string | null
}

const EMPTY_QUERY = ''
const NO_ERA = null
const DEFAULT_FILTERS: LibraryFilters = {
  query: EMPTY_QUERY,
  source: 'all',
  era: NO_ERA,
}

// The distinct eras across the loaded items, de-duplicated and sorted, so the
// era chips read in a stable order.
function distinctEras(items: LibraryItem[]): string[] {
  const eras = new Set<string>()
  for (const item of items) {
    for (const era of item.eras) {
      eras.add(era)
    }
  }
  return [...eras].sort()
}

function matchesQuery(item: LibraryItem, query: string): boolean {
  return item.name.toLowerCase().includes(query.toLowerCase())
}

function matchesSource(item: LibraryItem, source: SourceFilter): boolean {
  if (source === 'all') {
    return true
  }
  if (source === 'sample') {
    return item.reference.scope.startsWith('pack:')
  }
  return item.reference.scope === 'user'
}

function matchesEra(item: LibraryItem, era: string | null): boolean {
  if (era === NO_ERA) {
    return true
  }
  return item.eras.includes(era)
}

// Keep only the items satisfying every active filter (search AND source AND era).
function visibleLibraryItems(items: LibraryItem[], filters: LibraryFilters): LibraryItem[] {
  return items.filter(
    (item) =>
      matchesQuery(item, filters.query) &&
      matchesSource(item, filters.source) &&
      matchesEra(item, filters.era),
  )
}

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

function nextEra(active: string | null, clicked: string): string | null {
  if (active === clicked) {
    return NO_ERA
  }
  return clicked
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
