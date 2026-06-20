import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { setupServer } from 'msw/node'
import { PackSource } from './pack-source'
import { createFetchPackReader } from './fetch-pack-reader'
import { packErrorHandlers, packHandlers } from './msw-pack-handlers'

const BASE = 'http://localhost/packs/vernacular-starter-1.0.0'

const ASSETS = [
  { contentHash: 'a'.repeat(64), name: 'Mid-century chair' },
  { contentHash: 'b'.repeat(64), name: 'Edwardian writing desk' },
]

const server = setupServer()

beforeAll(() => {
  server.listen()
})

afterEach(() => {
  server.resetHandlers()
})

afterAll(() => {
  server.close()
})

describe('packHandlers', () => {
  it('serves a manifest that the fetch-backed PackSource lists as exactly its assets', async () => {
    server.use(...packHandlers({ base: BASE, assets: ASSETS }))

    const source = new PackSource(createFetchPackReader(BASE, fetch))
    const items = await source.list()

    expect(items.map((item) => item.name)).toEqual(['Mid-century chair', 'Edwardian writing desk'])
  })

  it('lists nothing when the mocked manifest request errors', async () => {
    server.use(...packErrorHandlers({ base: BASE }))

    const source = new PackSource(createFetchPackReader(BASE, fetch))

    expect(await source.list()).toEqual([])
  })
})
