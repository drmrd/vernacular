import { afterEach } from 'vitest'
import { CURRENT_SCHEMA_VERSION } from '../../../core'
import { BACKUP_DIRECTORY } from '../../../storage/documents/document-backups'
import { PROJECT_FILE } from '../../../storage/project-files/project-file-name'
import type {
  DocumentStore,
  WorkspaceDocumentStore,
} from '../../../storage/documents/document-store'
import type { DirectoryPort } from '../../../storage/fs/directory-port'
import type { Json } from '../../fixtures/projects/versions/fixture-documents'
import type { StoreConformanceTarget } from './store-conformance-target'

/** The name of the second document file that this build writes beside a newer main file. */
export const SECOND_FILE_NAME = `vernacular.format-${CURRENT_SCHEMA_VERSION}.json`

/** The start of the name of the copy that a save keeps of a stored file that it cannot read. */
export const UNREADABLE_PREFIX = 'unreadable-previous-'

/** The start of the name of the copy of a second file that was set aside, and of a replaced main file. */
export const SET_ASIDE_PREFIX = 'set-aside-second-file-'
export const REPLACED_PREFIX = 'replaced-by-second-file-'

/** The project that every case works on. A store bound to one project is bound to this id. */
export const PROJECT_ID = 'a'

/** The second project of a store that holds many. */
export const OTHER_PROJECT_ID = 'b'

/** A stored file: its name in a directory and its bytes. */
export interface NamedBytes {
  readonly name: string
  readonly bytes: Uint8Array
}

/** Every file directly under `directory` of `root`, each with its bytes. */
export async function filesUnder(root: DirectoryPort, directory: string): Promise<NamedBytes[]> {
  const names = await root.list(directory)
  return Promise.all(
    names.map(async (name) => ({
      name,
      bytes: (await root.readFile(`${directory}/${name}`)) ?? new Uint8Array(),
    })),
  )
}

/** One test of the suite: a store kind, over a root that only this test uses. */
export class ConformanceRun {
  constructor(
    private readonly target: StoreConformanceTarget,
    readonly root: DirectoryPort,
  ) {}

  /** Where the document file of the project sits in the root. */
  documentPath(id: string = PROJECT_ID): string {
    return this.target.holdsMany ? `${id}/${PROJECT_FILE}` : PROJECT_FILE
  }

  /** Where the second document file of this build sits in the root. */
  secondFilePath(id: string = PROJECT_ID): string {
    return this.target.holdsMany ? `${id}/${SECOND_FILE_NAME}` : SECOND_FILE_NAME
  }

  /** Puts raw bytes where this build writes the second document file of the project. */
  placeSecondFile(bytes: Uint8Array, id: string = PROJECT_ID): Promise<void> {
    return this.root.writeFile(this.secondFilePath(id), bytes)
  }

  /** The bytes of the second document file as they are in the root; undefined when there is none. */
  secondFileBytes(id: string = PROJECT_ID): Promise<Uint8Array | undefined> {
    return this.root.readFile(this.secondFilePath(id))
  }

  /** Every file of the backups directory of the project: its name and its bytes. */
  backups(id: string = PROJECT_ID): Promise<NamedBytes[]> {
    return filesUnder(
      this.root,
      this.target.holdsMany ? `${id}/${BACKUP_DIRECTORY}` : BACKUP_DIRECTORY,
    )
  }

  /** Puts raw bytes where the store reads the document of the project. */
  place(bytes: Uint8Array, id: string = PROJECT_ID): Promise<void> {
    return this.root.writeFile(this.documentPath(id), bytes)
  }

  /** A new store instance over the bytes of the root. */
  open(id: string = PROJECT_ID): DocumentStore {
    return this.target.open(this.root, id)
  }

  /** A new instance of a store that holds many projects; throws for any other kind. */
  openWorkspace(): WorkspaceDocumentStore {
    if (!this.target.holdsMany) throw new Error('This store holds one project, not many')
    return this.target.open(this.root, PROJECT_ID)
  }

  /** The bytes of the document file as they are in the root; undefined when there is none. */
  storedBytes(id: string = PROJECT_ID): Promise<Uint8Array | undefined> {
    return this.root.readFile(this.documentPath(id))
  }

  /** The document file in the root, parsed. */
  async storedDocument(id: string = PROJECT_ID): Promise<Json> {
    const bytes = await this.storedBytes(id)
    if (bytes === undefined) throw new Error(`No document is stored for ${id}`)
    return JSON.parse(new TextDecoder().decode(bytes))
  }
}

/** Starts a test of the suite on a new, empty root. */
export type BeginRun = () => Promise<ConformanceRun>

/**
 * Hands out one run for each test, and removes what each run made after the test. Call it in the
 * body of a `describe`, because it registers the cleanup there.
 */
export function runsOf(target: StoreConformanceTarget): BeginRun {
  const roots: DirectoryPort[] = []
  afterEach(async () => {
    const finished = roots.splice(0)
    await Promise.all(finished.map((root) => target.dispose?.(root)))
  })
  return async () => {
    const root = await target.createRoot()
    roots.push(root)
    return new ConformanceRun(target, root)
  }
}
