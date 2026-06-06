import { describe, expect, it } from 'vitest'
import { assertDirectoryPortContract } from './directory-contract'
import { InMemoryDirectory } from './in-memory-directory'

assertDirectoryPortContract('InMemoryDirectory', () => new InMemoryDirectory())

describe('InMemoryDirectory', () => {
  it('starts empty so the root lists nothing on a fresh instance', async () => {
    const directory = new InMemoryDirectory()

    expect(await directory.list('')).toEqual([])
  })
})
