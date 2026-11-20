import { afterEach, describe, expect, it, vi } from 'vitest'
import { opfsUsable } from './opfs-probe'
import { originPrivateRoot } from './origin-private-root'

const UNKNOWN_ERROR_MESSAGE = 'The operation failed for an unknown transient reason'

function stubStorageManager(getDirectory: () => Promise<unknown>): void {
  vi.stubGlobal('navigator', { storage: { getDirectory } })
}

function stubBrowserWithoutStorageManager(): void {
  vi.stubGlobal('navigator', {})
}

function aRootDirectory(): FileSystemDirectoryHandle {
  const root: unknown = { kind: 'directory', name: '' }
  return root as FileSystemDirectoryHandle
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('originPrivateRoot', () => {
  it('gives the root directory that the browser gives', async () => {
    const root = aRootDirectory()
    stubStorageManager(() => Promise.resolve(root))

    await expect(originPrivateRoot()).resolves.toBe(root)
  })

  it('rejects, and does not throw, where the browser has no storage manager', async () => {
    stubBrowserWithoutStorageManager()
    let pending: Promise<FileSystemDirectoryHandle> | undefined

    expect(() => {
      pending = originPrivateRoot()
    }).not.toThrow()

    await expect(pending).rejects.toThrow()
  })
})

describe('opfsUsable', () => {
  it('reports usable when the root resolves', async () => {
    stubStorageManager(() => Promise.resolve(aRootDirectory()))

    await expect(opfsUsable()).resolves.toBe(true)
  })

  it('reports not usable when the root rejects', async () => {
    stubStorageManager(() =>
      Promise.reject(new DOMException(UNKNOWN_ERROR_MESSAGE, 'UnknownError')),
    )

    await expect(opfsUsable()).resolves.toBe(false)
  })

  it('reports not usable where the browser has no storage manager, and never rejects', async () => {
    stubBrowserWithoutStorageManager()

    await expect(opfsUsable()).resolves.toBe(false)
  })
})
