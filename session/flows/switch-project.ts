import type { SessionPorts } from '../ports'
import type { DocumentHandle, OpenFailure, OpenRequest } from '../handle/handle-types'
import { openDocumentHandle } from '../handle/open-document-handle'

/** A switch that ended: the handle now open, or why the current project stays open. */
export type SwitchResult =
  | { readonly ok: true; readonly handle: DocumentHandle }
  | { readonly ok: false; readonly failure: { readonly kind: 'flush-failed' } | OpenFailure }

function flushFailed(): SwitchResult {
  return { ok: false, failure: { kind: 'flush-failed' } }
}

/**
 * Flush the current project, open the target, close the current one. On failure the current
 * handle stays open. Asking for the project that is already open returns its handle and calls
 * nothing. The promise never rejects. The current handle, when it is given, must be open: the
 * function compares only ids, so a closed handle with the target's id would come back as it is.
 */
export async function switchProject(
  ports: SessionPorts,
  current: DocumentHandle | undefined,
  target: OpenRequest,
): Promise<SwitchResult> {
  if (current === undefined) {
    return openDocumentHandle(ports, target)
  }
  if (current.id === target.id) {
    return { ok: true, handle: current }
  }
  if (!(await current.flush()).ok) {
    return flushFailed()
  }
  const opened = await openDocumentHandle(ports, target)
  if (!opened.ok) {
    return opened
  }
  if (!(await current.close()).ok) {
    // The edit that arrived while the target loaded is not stored, so the current project stays.
    // The result of closing the target is not checked: nothing was edited in it, so its close
    // writes nothing and frees its lock.
    await opened.handle.close()
    return flushFailed()
  }
  return opened
}
