import { afterEach, describe, expect, it, vi } from 'vitest'
import { packListing } from './action-test-support'
import { loadPackSupplies } from './pack-supplies'

const PACK_HASH = 'd'.repeat(64)
const OTHER_HASH = 'e'.repeat(64)
const INSTALLED_PACK = 'pack:vernacular-starter@1.0.0'
const NEWER_PACK = 'pack:vernacular-starter@2.0.0'
const LISTING_FAILURE = 'The pack could not be read.'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('loadPackSupplies', () => {
  it('gives no pack supplies when the application has no library', async () => {
    expect(await loadPackSupplies(undefined)).toBeUndefined()
  })

  it('accepts the hash of a pack item under another version of the same pack', async () => {
    const supplies = await loadPackSupplies(
      packListing({ scope: INSTALLED_PACK, contentHash: PACK_HASH }),
    )

    expect(supplies?.({ scope: NEWER_PACK, contentHash: PACK_HASH })).toBe(true)
  })

  it('refuses a hash that no pack item lists', async () => {
    const supplies = await loadPackSupplies(
      packListing({ scope: INSTALLED_PACK, contentHash: PACK_HASH }),
    )

    expect(supplies?.({ scope: INSTALLED_PACK, contentHash: OTHER_HASH })).toBe(false)
  })

  it('refuses the hash of an item that belongs to the user', async () => {
    const supplies = await loadPackSupplies(packListing({ scope: 'user', contentHash: PACK_HASH }))

    expect(supplies?.({ scope: INSTALLED_PACK, contentHash: PACK_HASH })).toBe(false)
  })

  it('accepts every reference when the listing of the library fails', async () => {
    const supplies = await loadPackSupplies({
      list: () => Promise.reject(new Error(LISTING_FAILURE)),
    })

    expect(supplies?.({ scope: INSTALLED_PACK, contentHash: OTHER_HASH })).toBe(true)
  })

  it('logs one warning with the error when the listing of the library fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const failure = new Error(LISTING_FAILURE)

    const supplies = await loadPackSupplies({ list: () => Promise.reject(failure) })

    expect(warn).toHaveBeenCalledTimes(1)
    const [sentence, logged] = warn.mock.calls[0] ?? []
    expect(typeof sentence === 'string' && sentence.length > 0).toBe(true)
    expect(logged).toBe(failure)
    expect(supplies?.({ scope: INSTALLED_PACK, contentHash: OTHER_HASH })).toBe(true)
  })

  it('logs no warning when the listing of the library answers', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await loadPackSupplies(packListing({ scope: INSTALLED_PACK, contentHash: PACK_HASH }))

    expect(warn).not.toHaveBeenCalled()
  })

  it('logs no warning when the application has no library', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await loadPackSupplies(undefined)

    expect(warn).not.toHaveBeenCalled()
  })
})
