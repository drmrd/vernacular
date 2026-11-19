import type { DecodeFailure, DecodeResult, Project } from '../../core'
import { createEditorSession, type EditorSession } from '../editor-session/editor-session'
import { callGuardedAsync } from '../guarded-call'
import { createDocumentHandle } from '../handle/document-handle'
import { type HandleInternals, internalsOf } from '../handle/handle-internals'
import type { DocumentHandle } from '../handle/handle-types'
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

/**
 * The document of the recovered copy. A copy that only breaks the format rules restores anyway,
 * with a warning, under the interim rule; it counts as opened despite faults.
 */
function decideDocument(restored: DecodeResult): OpenedProject | Refused {
  if (restored.ok) {
    return { project: restored.value.project, savedByNewerBuild: false, openedDespiteFaults: false }
  }
  const { failure } = restored
  if (failure.kind !== 'format-rules') {
    return refused({ kind: 'did-not-restore', decode: failure })
  }
  console.warn('The recovered copy breaks the format rules; restoring it anyway.', failure.faults)
  // The interim rule opens the failed document as a project, as every other read path does.
  const project = failure.document as Project
  return { project, savedByNewerBuild: false, openedDespiteFaults: true }
}

/**
 * Reads the newest snapshot and builds the new session, before the current handle gives anything
 * up. Every failure here leaves the current handle as it was.
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
  const { request, store } = internals
  let handle: DocumentHandle
  try {
    handle = createDocumentHandle({
      request,
      store,
      hold: handedOver.hold,
      opened,
      session,
      snapshots: current.snapshots,
    })
  } catch (error) {
    // Defence in depth: the builder calls no store method here, so nothing in it is known to throw.
    // The branch frees the lock so that it cannot leak if it does.
    await callGuardedAsync(() => handedOver.hold.release())
    return storageUnavailable(error)
  }
  await handle.save()
  return { ok: true, handle }
}
