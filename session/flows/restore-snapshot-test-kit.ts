import { currentBytes, renamed } from '../../tests/storage/conformance/conformance-documents'
import type { SessionPorts } from '../ports'
import {
  createTestPorts,
  openOrThrow,
  placeDocument,
  workspaceRequest,
} from '../handle/handle-test-kit'
import type { ControlledLocks, TestPorts } from '../handle/handle-test-kit'
import type { DocumentHandle } from '../handle/handle-types'

/** Test support: a stored project with a handle on it, for the tests of the restore flow. */

export const PROJECT_ID = 'a'
export const RECOVERED_NAME = 'Recovered after a crash'

export interface OpenedProject {
  readonly ports: TestPorts
  /** The ports that the handle was opened with: those of `ports`, with the locks of the test. */
  readonly sessionPorts: SessionPorts
  readonly handle: DocumentHandle
}

/** The ports, and a handle on a stored sound document of the project `a`. */
export async function openStored(locks?: ControlledLocks): Promise<OpenedProject> {
  const ports = createTestPorts()
  await placeDocument(ports, PROJECT_ID, currentBytes())
  const sessionPorts = locks === undefined ? ports : { ...ports, locks: locks.port }
  const handle = await openOrThrow(sessionPorts, workspaceRequest(PROJECT_ID))
  return { ports, sessionPorts, handle }
}

/** Writes the open project, under the recovered name, as the newest snapshot of the handle. */
export function snapshotRecovered(handle: DocumentHandle): Promise<void> {
  return handle.snapshots.writeSnapshot(renamed(handle.session.getProject(), RECOVERED_NAME))
}
