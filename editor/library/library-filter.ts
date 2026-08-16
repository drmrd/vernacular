import type { LibraryItem } from '../../storage'

export type SourceFilter = 'all' | 'sample' | 'yours'

export interface LibraryFilters {
  query: string
  source: SourceFilter
  era: string | null
  style: string | null
}

const EMPTY_QUERY = ''
const ANY_SOURCE: SourceFilter = 'all'
const NO_ERA = null
const NO_STYLE = null

export const DEFAULT_FILTERS: LibraryFilters = {
  query: EMPTY_QUERY,
  source: ANY_SOURCE,
  era: NO_ERA,
  style: NO_STYLE,
}

/**
 * The label each source carries on its control, declared in the order the
 * control presents them. The panel builds its segmented options from this, so a
 * relabelled control and a named active filter cannot drift apart.
 */
export const SOURCE_LABELS: Record<SourceFilter, string> = {
  all: 'All',
  sample: 'Sample',
  yours: 'Yours',
}

// Each filter that is narrowing the list, named the way its own control reads
// and ordered as the controls are, so a listing with nothing in it can say what
// is holding the items back.
export function activeFilterLabels(filters: LibraryFilters): string[] {
  const labels: string[] = []
  if (filters.query !== EMPTY_QUERY) {
    labels.push(`search "${filters.query}"`)
  }
  if (filters.source !== ANY_SOURCE) {
    labels.push(`source ${SOURCE_LABELS[filters.source]}`)
  }
  if (filters.era !== NO_ERA) {
    labels.push(`era ${filters.era}`)
  }
  if (filters.style !== NO_STYLE) {
    labels.push(`style ${filters.style}`)
  }
  return labels
}

const ACTIVE_FILTERS_PREFIX = 'Active filters: '

/** One line naming every filter currently narrowing the listing. */
export function activeFiltersDescription(filters: LibraryFilters): string {
  return `${ACTIVE_FILTERS_PREFIX}${activeFilterLabels(filters).join(', ')}`
}

// The distinct eras across the loaded items, de-duplicated and sorted, so the
// era chips read in a stable order.
export function distinctEras(items: LibraryItem[]): string[] {
  const eras = new Set<string>()
  for (const item of items) {
    for (const era of item.eras) {
      eras.add(era)
    }
  }
  return [...eras].sort()
}

// The distinct styles across the loaded items, de-duplicated and sorted, so the
// style chips read in a stable order.
export function distinctStyles(items: LibraryItem[]): string[] {
  const styles = new Set<string>()
  for (const item of items) {
    for (const style of item.styles ?? []) {
      styles.add(style)
    }
  }
  return [...styles].sort()
}

function matchesQuery(item: LibraryItem, query: string): boolean {
  return item.name.toLowerCase().includes(query.toLowerCase())
}

function matchesSource(item: LibraryItem, source: SourceFilter): boolean {
  if (source === ANY_SOURCE) {
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

function matchesStyle(item: LibraryItem, style: string | null): boolean {
  if (style === NO_STYLE) {
    return true
  }
  return (item.styles ?? []).includes(style)
}

// Keep only the items satisfying every active filter (search AND source AND era
// AND style).
export function visibleLibraryItems(items: LibraryItem[], filters: LibraryFilters): LibraryItem[] {
  return items.filter(
    (item) =>
      matchesQuery(item, filters.query) &&
      matchesSource(item, filters.source) &&
      matchesEra(item, filters.era) &&
      matchesStyle(item, filters.style),
  )
}

// The era a chip click should produce: toggling the active chip clears it,
// otherwise the clicked era becomes active.
export function nextEra(active: string | null, clicked: string): string | null {
  if (active === clicked) {
    return NO_ERA
  }
  return clicked
}

// The style a chip click should produce: toggling the active chip clears it,
// otherwise the clicked style becomes active.
export function nextStyle(active: string | null, clicked: string): string | null {
  if (active === clicked) {
    return NO_STYLE
  }
  return clicked
}
