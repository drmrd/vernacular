import { describe, expect, it } from 'vitest'
import type { AssetReference } from '../core'
import type { LibraryItem } from '../storage'
import { furnitureItem } from './action-test-support'
import { libraryHashesOf } from './library-hashes'

const MODEL_HASH = 'a'.repeat(64)
const OTHER_MODEL_HASH = 'b'.repeat(64)
const THUMBNAIL_HASH = 'c'.repeat(64)

const referenceTo = (contentHash: string): AssetReference => ({
  scope: 'pack:vernacular-starter@1.0.0',
  contentHash,
})

const listing =
  (...items: LibraryItem[]) =>
  () =>
    Promise.resolve(items)

describe('the content hashes that the library holds', () => {
  it('gives the hash of each item and the hash of each thumbnail', async () => {
    const withThumbnail: LibraryItem = {
      ...furnitureItem(referenceTo(MODEL_HASH)),
      thumbnail: referenceTo(THUMBNAIL_HASH),
    }
    const plain = furnitureItem(referenceTo(OTHER_MODEL_HASH))

    const hashes = await libraryHashesOf(listing(withThumbnail, plain))

    expect(hashes).toEqual(new Set([MODEL_HASH, THUMBNAIL_HASH, OTHER_MODEL_HASH]))
  })

  it('gives an empty set for a library with no item', async () => {
    expect(await libraryHashesOf(listing())).toEqual(new Set())
  })

  it('gives undefined when the list of the library rejects', async () => {
    const rejects = () => Promise.reject(new Error('The library cannot be read.'))

    expect(await libraryHashesOf(rejects)).toBeUndefined()
  })
})
