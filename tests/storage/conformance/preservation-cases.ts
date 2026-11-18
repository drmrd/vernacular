import { describe, expect, it } from 'vitest'
import {
  HIGHER_REVISION,
  UNKNOWN_FIELD,
  firstWallOf,
  metaOf,
} from '../../fixtures/projects/versions/fixture-documents'
import { PROJECT_ID } from './conformance-run'
import type { BeginRun } from './conformance-run'
import {
  EXTENSIONS_PAYLOAD,
  decodedOf,
  documentOfHigherRevision,
  documentWithExtensions,
  documentWithProjectStyle,
  withProjectStyleCleared,
} from './conformance-documents'

const ASSET_HASH = 'ef01234567ab89cdef01234567ab89cdef01234567ab89cdef01234567ab89cd'
const ASSET_BYTES = new TextEncoder().encode('the bytes of an asset')

/** Data that this build does not know, or that a command cleared, comes out of a save as it should. */
export function describeSavePreservation(begin: BeginRun): void {
  describe('a save', () => {
    it('keeps a field of a higher revision and the revision itself', async () => {
      const run = await begin()
      await run.place(documentOfHigherRevision())
      const store = run.open()
      const { project } = decodedOf(await store.read(PROJECT_ID))

      await store.save(PROJECT_ID, project)

      const stored = await run.storedDocument()
      expect(firstWallOf(stored)[UNKNOWN_FIELD]).toBe(1)
      expect(metaOf(stored).schemaRevision).toBe(HIGHER_REVISION)
    })

    it('keeps an extensions payload', async () => {
      const run = await begin()
      await run.place(documentWithExtensions())
      const store = run.open()
      const { project } = decodedOf(await store.read(PROJECT_ID))

      await store.save(PROJECT_ID, project)

      const stored = await run.storedDocument()
      expect(stored.extensions).toEqual(EXTENSIONS_PAYLOAD)
      expect(firstWallOf(stored).extensions).toEqual(EXTENSIONS_PAYLOAD)
    })

    it('leaves a cleared optional field cleared, for the next instance as well', async () => {
      const run = await begin()
      await run.place(documentWithProjectStyle())
      const store = run.open()
      const { project } = decodedOf(await store.read(PROJECT_ID))
      expect(metaOf(await run.storedDocument())).toHaveProperty('style')

      await store.save(PROJECT_ID, withProjectStyleCleared(project))

      expect(metaOf(await run.storedDocument())).not.toHaveProperty('style')
      const next = decodedOf(await run.open().read(PROJECT_ID))
      expect(next.project.meta.style).toBeUndefined()
    })
  })
}

/** An asset put through one instance of the store comes back from a new instance. */
export function describeAssetDurability(begin: BeginRun): void {
  describe('an asset', () => {
    it('is there from a new instance of the store', async () => {
      const run = await begin()
      await run.open().assets(PROJECT_ID).put(ASSET_HASH, ASSET_BYTES)

      const bytes = await run.open().assets(PROJECT_ID).get(ASSET_HASH)

      expect(bytes).toEqual(ASSET_BYTES)
    })
  })
}
