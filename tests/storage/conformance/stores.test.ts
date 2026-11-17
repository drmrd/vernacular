import { InMemoryDirectory } from '../../../storage/fs/in-memory-directory'
import { FileSystemFolderProjectStore } from '../../../storage/filesystem/file-system-folder-project-store'
import { InMemoryProjectStore } from '../../../storage/in-memory-project-store'
import { OpfsProjectStore } from '../../../storage/opfs/opfs-project-store'
import { ZipBundleProjectStore } from '../../../storage/zip/zip-bundle-project-store'
import { describeStoreConformance } from './describe-store-conformance'

describeStoreConformance({
  name: 'the in-memory workspace store',
  holdsMany: true,
  createRoot: () => new InMemoryDirectory(),
  open: (root) => new InMemoryProjectStore(root),
})

describeStoreConformance({
  name: 'the origin private file system store on an in-memory directory',
  holdsMany: true,
  createRoot: () => new InMemoryDirectory(),
  open: (root) => new OpfsProjectStore(root),
})

describeStoreConformance({
  name: 'the picked folder store on an in-memory directory',
  holdsMany: false,
  createRoot: () => new InMemoryDirectory(),
  open: (root, id) => new FileSystemFolderProjectStore(id, root),
})

describeStoreConformance({
  name: 'the archive store on an in-memory directory',
  holdsMany: false,
  createRoot: () => new InMemoryDirectory(),
  open: (root, id) => new ZipBundleProjectStore(id, root),
})
