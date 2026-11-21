/**
 * The note of a failed open in the record that the index already holds. It runs with no record
 * keeper, because a project that did not open has no session, so it lives apart from the keeper.
 */
import type { DecodeFailure } from '../../core'
import type { ProjectRecord } from '../../storage'
import type { RecordPorts } from './handle-record'
import {
  createWarnOnce,
  READ_WARNING,
  settlesInTime,
  WAIT_WARNING,
  WRITE_WARNING,
  type Warn,
} from './record-wait'

/** Puts back the existing record of the id with the failure of its open. */
async function noteFailedOpen(
  ports: RecordPorts,
  failed: { readonly id: string; readonly decode: DecodeFailure },
  warn: Warn,
): Promise<void> {
  let before: ProjectRecord | undefined
  try {
    before = await ports.index.get(failed.id)
  } catch (error) {
    warn(READ_WARNING, error)
    return
  }
  if (before === undefined) {
    return
  }
  const lastOpen = { opened: false, build: ports.build, reason: failed.decode.kind }
  try {
    await ports.index.put({ ...before, lastOpen })
  } catch (error) {
    warn(WRITE_WARNING, error)
  }
}

/**
 * Notes in an existing record that the stored project did not open. Waits at most
 * `RECORD_WAIT_MS`, then gives up the wait with a warning; the write may still land. Never rejects.
 */
export async function recordFailedOpen(
  ports: RecordPorts,
  id: string,
  decode: DecodeFailure,
): Promise<void> {
  const warn = createWarnOnce()
  if (!(await settlesInTime(noteFailedOpen(ports, { id, decode }, warn)))) {
    warn(WAIT_WARNING)
  }
}
