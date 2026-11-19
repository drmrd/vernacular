import type { FolderAccess, ProjectLockPort, WorkspaceDocumentStore } from '../storage'

/** What the session layer needs from the outside world to open and keep projects. */
export interface SessionPorts {
  /** The store of the projects kept in the browser. */
  readonly workspace: WorkspaceDocumentStore
  /** The locks that keep one project open in one tab at a time. */
  readonly locks: ProjectLockPort
  /** The folders that the user picked. */
  readonly folders: FolderAccess
  /** The present time. */
  readonly now: () => Date
}
