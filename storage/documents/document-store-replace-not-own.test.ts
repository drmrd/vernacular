// @vitest-environment node
// The archive store packs with fflate, which wants the node realm of Uint8Array.
import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '../../core'
import type { Project } from '../../core'
import type { DirectoryPort } from '../fs/directory-port'
import { InMemoryDirectory } from '../fs/in-memory-directory'
import { FileSystemFolderProjectStore } from '../filesystem/file-system-folder-project-store'
import { ProjectNotFoundError } from '../project-store'
import { ZipBundleProjectStore } from '../zip/zip-bundle-project-store'
import type { DocumentStore } from './document-store'
import { treeOf } from './document-store-test-kit'

const OWN_ID = 'house'
const OTHER_ID = 'cottage'

function projectNamed(name: string): Project {
  return createEmptyProject({ name, units: 'metric', period: 'craftsman', appVersion: '0.1.0' })
}

const storesBoundToOneProject: { name: string; over: (f: DirectoryPort) => DocumentStore }[] = [
  {
    name: 'the store of a picked folder',
    over: (f) => new FileSystemFolderProjectStore(OWN_ID, f),
  },
  { name: 'the store of an archive', over: (f) => new ZipBundleProjectStore(OWN_ID, f) },
]

describe.each(storesBoundToOneProject)(
  '$name, asked to replace an id that is not its own',
  ({ over }) => {
    it('rejects with ProjectNotFoundError and leaves every file of the folder as it was', async () => {
      const folder = new InMemoryDirectory()
      await over(folder).save(OWN_ID, projectNamed('Stored'))
      const before = await treeOf(folder)

      await expect(
        over(folder).replaceStored(OTHER_ID, projectNamed('Intruder')),
      ).rejects.toBeInstanceOf(ProjectNotFoundError)

      expect(await treeOf(folder)).toEqual(before)
    })
  },
)
