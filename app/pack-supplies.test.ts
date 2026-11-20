import { describe, expect, it } from 'vitest'
import type { AssetReference } from '../core'
import type { LibraryItem } from '../storage'
import { loadPackSupplies } from './pack-supplies'

const PACK_HASH = 'd'.repeat(64)
const OTHER_HASH = 'e'.repeat(64)
const INSTALLED_PACK = 'pack:vernacular-starter@1.0.0'
const NEWER_PACK = 'pack:vernacular-starter@2.0.0'
const LISTING_FAILURE = 'The pack could not be read.'

function itemOf(reference: AssetReference): LibraryItem {
  return {
    reference,
    name: 'Chair',
    kind: 'furniture',
    categories: [],
    eras: [],
    footprint: { width: 500, depth: 500 },
    height: 750,
  }
}

/** A library whose listing holds `items`. */
function libraryListing(...items: LibraryItem[]) {
  return { list: () => Promise.resolve(items) }
}

describe('loadPackSupplies', () => {
  it('gives no pack supplies when the application has no library', async () => {
    expect(await loadPackSupplies(undefined)).toBeUndefined()
  })

  it('accepts the hash of a pack item under another version of the same pack', async () => {
    const supplies = await loadPackSupplies(
      libraryListing(itemOf({ scope: INSTALLED_PACK, contentHash: PACK_HASH })),
    )

    expect(supplies?.({ scope: NEWER_PACK, contentHash: PACK_HASH })).toBe(true)
  })

  it('refuses a hash that no pack item lists', async () => {
    const supplies = await loadPackSupplies(
      libraryListing(itemOf({ scope: INSTALLED_PACK, contentHash: PACK_HASH })),
    )

    expect(supplies?.({ scope: INSTALLED_PACK, contentHash: OTHER_HASH })).toBe(false)
  })

  it('refuses the hash of an item that belongs to the user', async () => {
    const supplies = await loadPackSupplies(
      libraryListing(itemOf({ scope: 'user', contentHash: PACK_HASH })),
    )

    expect(supplies?.({ scope: INSTALLED_PACK, contentHash: PACK_HASH })).toBe(false)
  })

  it('accepts every reference when the listing of the library fails', async () => {
    const supplies = await loadPackSupplies({
      list: () => Promise.reject(new Error(LISTING_FAILURE)),
    })

    expect(supplies?.({ scope: INSTALLED_PACK, contentHash: OTHER_HASH })).toBe(true)
  })
})
