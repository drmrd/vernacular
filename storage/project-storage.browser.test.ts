import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteDatabaseNamed } from './indexeddb/legacy-records-test-kit'
import { createDefaultProjectStorage } from './project-storage'

/** The database the default storage opens; the browser of a test run starts with a fresh profile. */
const DEFAULT_DATABASE = 'vernacular'
const ASSET_HASH = 'cd'.repeat(32)
const ASSET_BYTES = Uint8Array.of(4, 5, 6)

beforeEach(() => deleteDatabaseNamed(DEFAULT_DATABASE))
afterEach(() => deleteDatabaseNamed(DEFAULT_DATABASE))

describe('the default project storage', () => {
  it('keeps the bytes of an asset where a second storage reads them back', async () => {
    await createDefaultProjectStorage().assets.put(ASSET_HASH, ASSET_BYTES)

    const bytes = await createDefaultProjectStorage().assets.get(ASSET_HASH)

    expect(bytes).toEqual(ASSET_BYTES)
  })
})
