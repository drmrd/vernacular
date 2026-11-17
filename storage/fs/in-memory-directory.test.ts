import { describe, expect, it } from 'vitest'
import { assertDirectoryPortContract } from './directory-contract'
import { InMemoryDirectory } from './in-memory-directory'

assertDirectoryPortContract('InMemoryDirectory', () => new InMemoryDirectory())

describe('InMemoryDirectory', () => {
  it('starts empty so the root lists nothing on a fresh instance', async () => {
    const directory = new InMemoryDirectory()

    expect(await directory.list('')).toEqual([])
  })

  it('reports the instant of its injected clock as the modification time of a write', async () => {
    const instant = '2026-01-02T03:04:05.000Z'
    const directory = new InMemoryDirectory({ now: () => new Date(instant) })

    await directory.writeFile('doc.json', Uint8Array.of(1))

    expect(await directory.modifiedAt('doc.json')).toBe(instant)
  })
})
