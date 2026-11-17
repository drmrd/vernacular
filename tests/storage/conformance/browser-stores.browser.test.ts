import { FileSystemDirectory } from '../../../storage/fs/file-system-directory'
import type { DirectoryPort } from '../../../storage/fs/directory-port'
import { IndexedDbDirectory } from '../../../storage/indexeddb/indexeddb-directory'
import { IndexedDbProjectStore } from '../../../storage/indexeddb/indexeddb-project-store'
import {
  deleteDatabaseNamed,
  freshDatabaseName,
} from '../../../storage/indexeddb/legacy-records-test-kit'
import { OpfsProjectStore } from '../../../storage/opfs/opfs-project-store'
import { describeStoreConformance } from './describe-store-conformance'

/** What a root of this file remembers about where it lives, so that a new store finds the same bytes. */
function remembered<T>(): {
  set(root: DirectoryPort, value: T): void
  get(root: DirectoryPort): T
} {
  const values = new WeakMap<DirectoryPort, T>()
  return {
    set: (root, value) => values.set(root, value),
    get: (root) => {
      const value = values.get(root)
      if (value === undefined) throw new Error('This root was not made by this target')
      return value
    },
  }
}

const databaseNames = remembered<string>()

describeStoreConformance({
  name: 'the IndexedDB workspace store',
  holdsMany: true,
  createRoot: () => {
    const name = freshDatabaseName()
    const root = new IndexedDbDirectory(name)
    databaseNames.set(root, name)
    return root
  },
  open: (root) => new IndexedDbProjectStore(databaseNames.get(root)),
  dispose: (root) => deleteDatabaseNamed(databaseNames.get(root)),
})

interface TestFolder {
  readonly name: string
  readonly handle: FileSystemDirectoryHandle
}

const testFolders = remembered<TestFolder>()

describeStoreConformance({
  name: 'the origin private file system store on the real file system',
  holdsMany: true,
  createRoot: async () => {
    const top = await navigator.storage.getDirectory()
    const name = `vernacular-conformance-${crypto.randomUUID()}`
    const handle = await top.getDirectoryHandle(name, { create: true })
    const root = new FileSystemDirectory(handle)
    testFolders.set(root, { name, handle })
    return root
  },
  open: (root) => new OpfsProjectStore(new FileSystemDirectory(testFolders.get(root).handle)),
  dispose: async (root) => {
    const top = await navigator.storage.getDirectory()
    await top.removeEntry(testFolders.get(root).name, { recursive: true })
  },
})
