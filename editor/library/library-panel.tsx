import { useEffect, useState, type ReactElement } from 'react'

import { formatAssetReference } from '../../core'
import { Button, EmptyState, LoadingState, Segmented, type SegmentedOption } from '../design-system'
import type { AssetRegistry, LibraryItem } from '../../storage'
import { useAssetRegistry } from '../../bridge/react/asset-registry-context'

import {
  DEFAULT_FILTERS,
  SOURCE_LABELS,
  activeFiltersDescription,
  distinctEras,
  distinctStyles,
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
  armed?: LibraryItem | null
  /** Whether an asset source is available to receive an imported model. */
  canImport?: boolean
  /** Changing this re-lists the registry, so a just-imported item appears without a reopen. */
  libraryRevision?: number
  /** Filter state held by a host that outlives the panel. Omit to let the panel hold its own. */
  filterState?: LibraryFilterState
}

/** The browsing filters and the one way to change them, kept together so neither travels alone. */
export interface LibraryFilterState {
  filters: LibraryFilters
  setFilters: (filters: LibraryFilters) => void
}

// The panel keeps its own browsing filters unless a host supplies them, which is
// how the launcher keeps a search term alive across a close: the panel holding
// the state unmounts, the launcher does not.
function useFilterState(hostState: LibraryFilterState | undefined): LibraryFilterState {
  const [ownFilters, setOwnFilters] = useState<LibraryFilters>(DEFAULT_FILTERS)
  return hostState ?? { filters: ownFilters, setFilters: setOwnFilters }
}

// Load the registry's library items, guarding against a state update after the
// panel unmounts. A null result marks the still-loading state. Re-lists whenever
// the registry identity or the revision changes, keeping the items already shown
// on screen while the fresh listing arrives.
function useLibraryItems(registry: AssetRegistry, revision: number): LibraryItem[] | null {
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
  }, [registry, revision])
  return items
}

const EMPTY_MESSAGE = 'Your library is empty'
const LOADING_MESSAGE = 'Loading furniture...'
const NO_MATCHES_MESSAGE = 'No matches'
const CLEAR_FILTERS_LABEL = 'Clear filters'
// The key use-furniture-keyboard binds while the place-furniture tool is active,
// named where the ghost it turns is waiting to land.
const ROTATE_HINT = 'R to rotate'
// The picker's accept filter carries the format detail, so the action names the
// outcome rather than the container.
const IMPORT_LABEL = 'Import a 3D model'

interface LibraryGridProps {
  items: LibraryItem[]
  onPick: (item: LibraryItem) => void
  armed: LibraryItem | null
}

// One pickable button per library item, keyed by its content-addressed reference.
function LibraryGrid({ items, onPick, armed }: LibraryGridProps): ReactElement {
  const armedReference = armed ? formatAssetReference(armed.reference) : null
  return (
    <ul className="library-panel__grid">
      {items.map((item, index) => (
        <li
          key={`${formatAssetReference(item.reference)}:${index}`}
          className="library-panel__cell"
        >
          <Button
            className="ds-menu-surface__row"
            onClick={() => onPick(item)}
            aria-pressed={formatAssetReference(item.reference) === armedReference}
          >
            <span className="library-panel__thumb" aria-hidden="true" />
            {item.name}
          </Button>
        </li>
      ))}
    </ul>
  )
}

// Built from the shared label table so the control and the named active filter
// always read the same, in the order the table declares.
const SOURCE_OPTIONS = Object.entries(SOURCE_LABELS).map(([value, label]) => ({
  value,
  label,
})) satisfies SegmentedOption[]

// The era segmented control always carries a default-active option that maps to
// the unfiltered (no-era) state, so exactly one option stays selected even when
// the user has not narrowed to a specific era.
const ALL_ERAS_VALUE = '__all-eras__'
const ALL_ERAS_LABEL = 'All eras'

// The style segmented control mirrors the era control: a default-active option
// maps to the unfiltered (no-style) state, so exactly one option stays selected.
const ALL_STYLES_VALUE = '__all-styles__'
const ALL_STYLES_LABEL = 'All styles'

interface LibraryControlsProps {
  filters: LibraryFilters
  eras: string[]
  styles: string[]
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

function StyleChips({ filters, styles, setFilters }: LibraryControlsProps): ReactElement {
  const options = [
    { value: ALL_STYLES_VALUE, label: ALL_STYLES_LABEL },
    ...styles.map((style) => ({ value: style, label: style })),
  ]
  return (
    <Segmented
      label="Style"
      options={options}
      value={filters.style ?? ALL_STYLES_VALUE}
      onSelect={(value) =>
        setFilters({ ...filters, style: value === ALL_STYLES_VALUE ? null : value })
      }
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
      <StyleChips {...props} />
    </div>
  )
}

// A library that holds items but shows none: the filters, not the library, are
// what emptied the grid, so the state names them and offers a way out.
function NoMatchesState({ filters, setFilters }: LibraryFilterState): ReactElement {
  return (
    <EmptyState
      title={NO_MATCHES_MESSAGE}
      description={activeFiltersDescription(filters)}
      action={<Button onClick={() => setFilters(DEFAULT_FILTERS)}>{CLEAR_FILTERS_LABEL}</Button>}
      asRegion={false}
    />
  )
}

interface LibraryBodyProps extends LibraryFilterState {
  items: LibraryItem[] | null
  onPick: (item: LibraryItem) => void
  armed: LibraryItem | null
}

// Pick the body to render: a loading state while listing, the empty message when
// there are no items, otherwise the filter controls above the matching grid (or
// the no-match state when the filters keep everything out).
function LibraryBody(props: LibraryBodyProps): ReactElement | null {
  const { items, onPick, armed, filters, setFilters } = props
  if (items === null) {
    return <LoadingState message={LOADING_MESSAGE} />
  }
  if (items.length === 0) {
    return <EmptyState title={EMPTY_MESSAGE} asRegion={false} />
  }
  const visible = visibleLibraryItems(items, filters)
  return (
    <>
      <LibraryControls
        filters={filters}
        eras={distinctEras(items)}
        styles={distinctStyles(items)}
        setFilters={setFilters}
      />
      {armed ? (
        <p className="library-panel__placement-hint">
          Click the canvas to place {armed.name}{' '}
          <span className="library-panel__placement-key">{ROTATE_HINT}</span>
        </p>
      ) : null}
      {visible.length === 0 ? (
        <NoMatchesState filters={filters} setFilters={setFilters} />
      ) : (
        <LibraryGrid items={visible} onPick={onPick} armed={armed} />
      )}
    </>
  )
}

export function LibraryPanel(props: LibraryPanelProps): ReactElement {
  const { onPick, onImport, armed = null, canImport = true, libraryRevision = 0 } = props
  const registry = useAssetRegistry()
  const items = useLibraryItems(registry, libraryRevision)
  const { filters, setFilters } = useFilterState(props.filterState)
  return (
    <section className="library-panel ds-menu-surface" aria-label="Furniture library">
      <Button className="library-panel__import" onClick={onImport} disabled={!canImport}>
        {IMPORT_LABEL}
      </Button>
      <LibraryBody
        items={items}
        onPick={onPick}
        armed={armed}
        filters={filters}
        setFilters={setFilters}
      />
    </section>
  )
}
