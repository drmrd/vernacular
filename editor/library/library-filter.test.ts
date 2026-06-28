import { describe, expect, it } from 'vitest'
import type { LibraryItem } from '../../storage'
import {
  DEFAULT_FILTERS,
  distinctStyles,
  nextStyle,
  visibleLibraryItems,
  type LibraryFilters,
} from './library-filter'

const FOOTPRINT = { width: 600, depth: 600 }
const HEIGHT_MM = 750

function libraryItem(name: string, styles: string[]): LibraryItem {
  return {
    reference: { scope: 'user', contentHash: name },
    name,
    kind: 'furniture',
    categories: [],
    eras: [],
    styles,
    footprint: FOOTPRINT,
    height: HEIGHT_MM,
  }
}

const QUEEN_ANNE_CHAIR = libraryItem('Queen Anne chair', ['queen-anne'])
const CRAFTSMAN_SETTLE = libraryItem('Craftsman settle', ['craftsman'])

describe('DEFAULT_FILTERS', () => {
  it('starts with no style selected', () => {
    expect(DEFAULT_FILTERS.style).toBeNull()
  })
})

describe('distinctStyles', () => {
  it('returns the de-duplicated styles across items in sorted order', () => {
    const items = [libraryItem('a', ['queen-anne', 'craftsman']), libraryItem('b', ['craftsman'])]
    expect(distinctStyles(items)).toEqual(['craftsman', 'queen-anne'])
  })

  it('ignores items that declare no styles', () => {
    const items = [libraryItem('a', []), libraryItem('b', ['craftsman'])]
    expect(distinctStyles(items)).toEqual(['craftsman'])
  })
})

describe('nextStyle', () => {
  it('selects a clicked style that is not already active', () => {
    expect(nextStyle(null, 'queen-anne')).toBe('queen-anne')
  })

  it('clears the active style when its own chip is clicked again', () => {
    expect(nextStyle('queen-anne', 'queen-anne')).toBeNull()
  })
})

describe('visibleLibraryItems style filtering', () => {
  const items = [QUEEN_ANNE_CHAIR, CRAFTSMAN_SETTLE]

  it('keeps every item when no style is selected', () => {
    const filters: LibraryFilters = { ...DEFAULT_FILTERS, style: null }
    expect(visibleLibraryItems(items, filters)).toEqual(items)
  })

  it('keeps only items declaring the selected style', () => {
    const filters: LibraryFilters = { ...DEFAULT_FILTERS, style: 'queen-anne' }
    expect(visibleLibraryItems(items, filters)).toEqual([QUEEN_ANNE_CHAIR])
  })
})
