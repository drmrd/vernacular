import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveProjectStorage } from './resolve-project-store'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('The lookup of the project storage', () => {
  it('rejects with an error on a host with neither the origin private file system nor IndexedDB', async () => {
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('indexedDB', undefined)

    await expect(resolveProjectStorage()).rejects.toBeInstanceOf(Error)
  })

  it('resolves on a host with IndexedDB alone', async () => {
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('indexedDB', {})

    const storage = await resolveProjectStorage()

    expect(storage.store).toBeDefined()
    expect(storage.assets).toBeDefined()
  })
})
