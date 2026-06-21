import { useEffect, useState, type ReactElement } from 'react'

import { formatAssetReference } from '../../core'
import { Button, LoadingState, Segmented, type SegmentedOption } from '../design-system'
import type { AssetRegistry, LibraryItem } from '../../storage'
import { useAssetRegistry } from '../../bridge/react/asset-registry-context'

import {
  DEFAULT_FILTERS,
  distinctEras,
  visibleLibraryItems,
  type LibraryFilters,
  type SourceFilter,
} from './library-filter'

import '../design-system/field.css'
import '../design-system/menu-surface.css'
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
const LOADING_MESSAGE = 'Loading furniture...'

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
          <Button className="ds-menu-surface__row" onClick={() => onPick(item)}>
            {item.name}
          </Button>
        </li>
      ))}
    </ul>
  )
}

const SOURCE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'sample', label: 'Sample' },
  { value: 'yours', label: 'Yours' },
] satisfies SegmentedOption[]

// The era segmented control always carries a default-active option that maps to
// the unfiltered (no-era) state, so exactly one option stays selected even when
// the user has not narrowed to a specific era.
const ALL_ERAS_VALUE = '__all-eras__'
const ALL_ERAS_LABEL = 'All eras'

interface LibraryControlsProps {
  filters: LibraryFilters
  eras: string[]
  setFilters: (filters: LibraryFilters) => void
}

function SourceToggle({ filters, setFilters }: LibraryControlsProps): ReactElement {
  return (
    <Segmented
      label="Source"
      options={SOURCE_OPTIONS}
      value={filters.source}
      onSelect={(value) => setFilters({ ...filters, source: value as SourceFilter })}
    />
  )
}

function EraChips({ filters, eras, setFilters }: LibraryControlsProps): ReactElement {
  const options = [
    { value: ALL_ERAS_VALUE, label: ALL_ERAS_LABEL },
    ...eras.map((era) => ({ value: era, label: era })),
  ]
  return (
    <Segmented
      label="Era"
      options={options}
      value={filters.era ?? ALL_ERAS_VALUE}
      onSelect={(value) => setFilters({ ...filters, era: value === ALL_ERAS_VALUE ? null : value })}
    />
  )
}

// Search box, source toggle, and era chips that drive the visible-item filter.
function LibraryControls(props: LibraryControlsProps): ReactElement {
  const { filters, setFilters } = props
  return (
    <div className="library-panel__controls">
      <input
        type="search"
        className="ds-field__control"
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

// Pick the body to render: a loading state while listing, the empty message when
// there are no items, otherwise the filter controls above the matching grid.
function LibraryBody({ items, onPick }: LibraryBodyProps): ReactElement | null {
  const [filters, setFilters] = useState<LibraryFilters>(DEFAULT_FILTERS)
  if (items === null) {
    return <LoadingState message={LOADING_MESSAGE} />
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
    <section className="library-panel ds-menu-surface" aria-label="Furniture library">
      <Button className="library-panel__import" onClick={onImport}>
        Import GLB
      </Button>
      <LibraryBody items={items} onPick={onPick} />
    </section>
  )
}
