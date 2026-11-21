import type { DecodeFailure, DecodeResult } from '../../core'
import { createEditorSession, type EditorSession } from '../editor-session/editor-session'
import { callGuardedAsync } from '../guarded-call'
import { createDocumentHandle } from '../handle/document-handle'
import { type HandleInternals, internalsOf } from '../handle/handle-internals'
import type { DocumentHandle } from '../handle/handle-types'
import { setAsideRefusedCopies } from '../handle/set-aside-refused-copies'
import type { OpenedProject } from '../handle/read-for-open'
import { storageUnavailable } from '../handle/thrown-failures'
import { type FlowResult, flushFailed } from './flow-result'

/** Why a recovered copy did not replace the open project, besides a failed flush or storage. */
export type RestoreRefusal =
  | { readonly kind: 'nothing-to-restore' }
  | { readonly kind: 'did-not-restore'; readonly decode: DecodeFailure }

type RestoreResult = FlowResult<RestoreRefusal>
type Refused = Extract<RestoreResult, { readonly ok: false }>

/** What the restore starts the new handle from, or why it stops before the hand-over. */
type Prepared =
  | {
      readonly ok: true
      readonly opened: OpenedProject
      readonly session: EditorSession
      readonly internals: HandleInternals
    }
  | Refused

function refused(failure: RestoreRefusal): Refused {
  return { ok: false, failure }
}

/** The document of the recovered copy, or why the copy does not restore. */
function decideDocument(restored: DecodeResult): OpenedProject | Refused {
  if (restored.ok) {
    return { project: restored.value.project, savedByNewerBuild: false }
  }
  return refused({ kind: 'did-not-restore', decode: restored.failure })
}

/**
 * Reads the newest snapshot and builds the new session, before the current handle gives anything
 * up. A failure here leaves the current handle open and its project unchanged. One step can still
 * change it: when a refused copy cannot be moved to the backups, the handle stops its snapshot
 * writes and prunes, so that the copy outlives its saves.
 */
async function prepareRestore(current: DocumentHandle): Promise<Prepared> {
  try {
    const internals = internalsOf(current)
    const restored = await current.snapshots.restore()
    if (restored === undefined) {
      return refused({ kind: 'nothing-to-restore' })
    }
    const opened = decideDocument(restored)
    if ('ok' in opened) {
      // A copy that does not decode moves to the backups, so the prompt stops offering it.
      // A copy that stays where it is must outlive the saves of the handle that stays open.
      if ((await setAsideRefusedCopies(current.snapshots)) === 'failed') {
        internals.leaveSnapshots()
      }
      return opened
    }
    return { ok: true, opened, session: createEditorSession(opened.project), internals }
  } catch (error) {
    return storageUnavailable(error)
  }
}

/**
 * Replaces the open project with its newest recovery snapshot. The current handle writes what is
 * unsaved and ends, and its lock passes to a new handle on the same id, location, and store, so the
 * lock is held at every moment and two handles never write at once. The restored document is
 * saved at once; the result holds the new handle whatever that save's outcome. The new handle reuses
 * the snapshots object of the current one, so the restore asks the store for nothing after the
 * hand-over. A failure leaves the current handle open, with one exception: when the restore
 * overlaps a close of the same handle, the result is flush-failed although the handle is closed.
 * The promise never rejects.
 */
export async function restoreSnapshot(current: DocumentHandle): Promise<RestoreResult> {
  const prepared = await prepareRestore(current)
  if (!prepared.ok) {
    return prepared
  }
  const { opened, session, internals } = prepared
  const handedOver = await internals.handOver()
  if (!handedOver.ok) {
    return flushFailed()
  }
  const { request, store, records } = internals
  let handle: DocumentHandle
  try {
    handle = createDocumentHandle({
      request,
      store,
      hold: handedOver.hold,
      opened,
      session,
      snapshots: current.snapshots,
      records,
      stored: internals.stored(),
    })
  } catch (error) {
    // Defence in depth: the builder calls no store method here, so nothing in it is known to throw.
    // The branch frees the lock so that it cannot leak if it does.
    // The lock is free after this, so the keeper must build no more records.
    records.lockReleased()
    await callGuardedAsync(() => handedOver.hold.release())
    return storageUnavailable(error)
  }
  await handle.save()
  return { ok: true, handle }
}
