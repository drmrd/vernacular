// @vitest-environment node
// Pure storage logic over lists of hashes in memory; node runs it as the other archive tests run.
import { describe, expect, it } from 'vitest'
import { removableAssets, type AssetUser } from './removable-assets'

const HASH_LENGTH = 64
const FIRST = 'a'.repeat(HASH_LENGTH)
const SECOND = 'b'.repeat(HASH_LENGTH)
const THIRD = 'c'.repeat(HASH_LENGTH)
const FOURTH = 'd'.repeat(HASH_LENGTH)
const DELETED = 'deleted-project'
const OTHER = 'other-project'

function assetUser(
  id: string,
  assetHashes: readonly string[],
  assetListComplete = true,
): AssetUser {
  return { id, assetHashes, assetListComplete }
}

const noLibrary: ReadonlySet<string> = new Set<string>()

describe('removableAssets', () => {
  it('removes an asset that only the deleted project used', () => {
    const users = [assetUser(DELETED, [FIRST, SECOND]), assetUser(OTHER, [THIRD])]

    expect(removableAssets(DELETED, users, noLibrary)).toEqual([FIRST, SECOND])
  })

  it('keeps an asset that another project uses', () => {
    const users = [assetUser(DELETED, [FIRST, SECOND]), assetUser(OTHER, [SECOND])]

    expect(removableAssets(DELETED, users, noLibrary)).toEqual([FIRST])
  })

  it('keeps an asset that the library uses', () => {
    const users = [assetUser(DELETED, [FIRST, SECOND])]
    const library: ReadonlySet<string> = new Set([SECOND])

    expect(removableAssets(DELETED, users, library)).toEqual([FIRST])
  })

  it('removes nothing while any other project has an incomplete asset list', () => {
    const users = [
      assetUser(DELETED, [FIRST]),
      assetUser(OTHER, [THIRD]),
      assetUser('unreadable-project', [FOURTH], false),
    ]

    expect(removableAssets(DELETED, users, noLibrary)).toEqual([])
  })

  it('keeps a library asset that the deleted project lists twice', () => {
    const users = [assetUser(DELETED, [FIRST, SECOND, FIRST])]
    const library: ReadonlySet<string> = new Set([FIRST])

    expect(removableAssets(DELETED, users, library)).toEqual([SECOND])
  })

  it('an incomplete other user that lists nothing still blocks everything', () => {
    const users = [assetUser(DELETED, [FIRST]), assetUser('unreadable-project', [], false)]

    expect(removableAssets(DELETED, users, noLibrary)).toEqual([])
  })

  it('removes the listed assets of the deleted project even when its own list is incomplete', () => {
    const users = [assetUser(DELETED, [FIRST, SECOND], false), assetUser(OTHER, [SECOND])]

    expect(removableAssets(DELETED, users, noLibrary)).toEqual([FIRST])
  })

  it('removes nothing for a deleted id that no project has', () => {
    const users = [assetUser(OTHER, [FIRST, SECOND])]

    expect(removableAssets(DELETED, users, noLibrary)).toEqual([])
  })

  it('names an asset listed twice once and keeps the order of the lists', () => {
    const users = [
      assetUser(DELETED, [SECOND, FIRST, SECOND]),
      assetUser(OTHER, [FOURTH]),
      assetUser(DELETED, [FIRST, THIRD]),
    ]

    expect(removableAssets(DELETED, users, noLibrary)).toEqual([SECOND, FIRST, THIRD])
  })

  it('never removes a value that is not a content hash', () => {
    const notHashes = [
      'not-a-hash',
      '',
      '../escape',
      'A'.repeat(HASH_LENGTH),
      'a'.repeat(HASH_LENGTH - 1),
      'a'.repeat(HASH_LENGTH + 1),
    ]
    const users = [assetUser(DELETED, [...notHashes, FIRST])]

    expect(removableAssets(DELETED, users, noLibrary)).toEqual([FIRST])
  })

  it('removes every listed asset when there is no other project and the library is empty', () => {
    const users = [assetUser(DELETED, [FIRST, SECOND, THIRD])]

    expect(removableAssets(DELETED, users, noLibrary)).toEqual([FIRST, SECOND, THIRD])
  })

  it('accepts frozen arguments and changes none of them', () => {
    const deletedHashes = Object.freeze([FIRST, SECOND, FIRST])
    const otherHashes = Object.freeze([SECOND])
    const users: readonly AssetUser[] = Object.freeze([
      Object.freeze(assetUser(DELETED, deletedHashes)),
      Object.freeze(assetUser(OTHER, otherHashes)),
    ])
    const library = new Set([THIRD])

    const result = removableAssets(DELETED, users, library)

    expect(result).toEqual([FIRST])
    expect(deletedHashes).toEqual([FIRST, SECOND, FIRST])
    expect(otherHashes).toEqual([SECOND])
    expect([...library]).toEqual([THIRD])
  })
})
