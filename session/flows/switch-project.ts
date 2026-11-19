import type { SessionPorts } from '../ports'
import type { DocumentHandle, OpenFailure, OpenRequest } from '../handle/handle-types'
import { openDocumentHandle } from '../handle/open-document-handle'

/** A switch that ended: the handle now open, or why the current project stays open. */
export type SwitchResult =
  | { readonly ok: true; readonly handle: DocumentHandle }
  | { readonly ok: false; readonly failure: { readonly kind: 'flush-failed' } | OpenFailure }

const FLUSH_FAILED: SwitchResult = { ok: false, failure: { kind: 'flush-failed' } }

/**
 * Flush the current project, open the target, close the current one. On failure the current
 * handle stays open. Asking for the project that is already open returns its handle and calls
 * nothing. The promise never rejects.
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
    return FLUSH_FAILED
  }
  const opened = await openDocumentHandle(ports, target)
  if (!opened.ok) {
    return opened
  }
  if (!(await current.close()).ok) {
    // The edit that arrived while the target loaded is not stored, so the current project stays.
    await opened.handle.close()
    return FLUSH_FAILED
  }
  return opened
}
