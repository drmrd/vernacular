import { describe, expect, it } from 'vitest'
import { InMemoryAssetCache, UserSource } from '../../storage'
import type { LibraryItem, UserLibraryIndex } from '../../storage'
import { DEFAULT_FURNITURE_FOOTPRINT_MM } from '../../core'
import { isGlb, importFurnitureGlb } from './use-furniture-import'

function glbBytes(): Uint8Array {
  return Uint8Array.of(0x67, 0x6c, 0x54, 0x46, 1, 0, 0, 0, 9, 9, 9)
}

function makeUserSource(): UserSource {
  const items: LibraryItem[] = []
  const index: UserLibraryIndex = {
    list: async () => items.slice(),
    add: async (item: LibraryItem) => {
      items.push(item)
    },
  }
  return new UserSource(new InMemoryAssetCache(), index)
}

describe('isGlb', () => {
  it('returns true for bytes starting with the glTF binary magic', () => {
    expect(isGlb(glbBytes())).toBe(true)
  })

  it('returns false for bytes starting with ZIP magic (not glTF)', () => {
    expect(isGlb(Uint8Array.of(0x50, 0x4b, 3, 4))).toBe(false)
  })

  it('returns false when the byte array is too short to contain the magic', () => {
    expect(isGlb(Uint8Array.of(0x67, 0x6c))).toBe(false)
  })
})

describe('importFurnitureGlb', () => {
  it('resolves to a LibraryItem with user scope, furniture kind, stripped name, and default footprint', async () => {
    const userSource = makeUserSource()
    const file = new File([glbBytes()], 'Mid Century Chair.glb')

    const item = await importFurnitureGlb(file, userSource)

    expect(item.reference.scope).toBe('user')
    expect(item.kind).toBe('furniture')
    expect(item.name).toBe('Mid Century Chair')
    expect(item.footprint).toEqual(DEFAULT_FURNITURE_FOOTPRINT_MM)
    expect(item.eras).toEqual([])
    expect(item.categories).toEqual([])
  })

  it('caches the GLB bytes under the content hash and adds the item to the source', async () => {
    const userSource = makeUserSource()
    const file = new File([glbBytes()], 'Mid Century Chair.glb')

    const item = await importFurnitureGlb(file, userSource)
    const listed = await userSource.list()
    const cached = await userSource.read(item.reference.contentHash)

    expect(listed).toContainEqual(item)
    expect(cached).toEqual(glbBytes())
  })

  it('rejects and adds nothing to the source when the file is not a GLB', async () => {
    const userSource = makeUserSource()
    const badFile = new File([Uint8Array.of(1, 2, 3, 4)], 'bad.glb')

    await expect(importFurnitureGlb(badFile, userSource)).rejects.toThrow()
    expect(await userSource.list()).toHaveLength(0)
  })
})
