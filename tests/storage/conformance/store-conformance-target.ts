import type {
  DocumentStore,
  WorkspaceDocumentStore,
} from '../../../storage/documents/document-store'
import type { DirectoryPort } from '../../../storage/fs/directory-port'

/** What every kind of store gives the conformance suite, whatever the store holds. */
interface TargetBase {
  /** The title of the `describe` block that holds the cases of this store. */
  readonly name: string
  /** A new, empty byte port for one test. The suite places raw document bytes through it. */
  createRoot(): DirectoryPort | Promise<DirectoryPort>
  /** Removes what `createRoot` made. */
  dispose?(root: DirectoryPort): Promise<void>
}

/** A store that holds many projects side by side, and deletes one of them. */
export interface WorkspaceStoreTarget extends TargetBase {
  readonly holdsMany: true
  /** A NEW store instance over the bytes of `root`. The id plays no part: a workspace holds them all. */
  open(root: DirectoryPort, id: string): WorkspaceDocumentStore
}

/** A store bound to one project, such as a picked folder or an archive. */
export interface SingleProjectStoreTarget extends TargetBase {
  readonly holdsMany: false
  /** A NEW store instance over the bytes of `root`, bound to the project `id`. */
  open(root: DirectoryPort, id: string): DocumentStore
}

/** One kind of store that runs the conformance suite. */
export type StoreConformanceTarget = WorkspaceStoreTarget | SingleProjectStoreTarget
