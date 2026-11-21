import { renameProject as renameProjectCommand } from '../../core'
import type { DocumentHandle, OpenFailure } from '../handle/handle-types'
import { openDocumentHandle } from '../handle/open-document-handle'
import { storageUnavailable } from '../handle/thrown-failures'
import type { SessionPorts } from '../ports'
import { recentTarget } from './open-recent'

export interface RenameRequest {
  readonly id: string
  readonly name: string
}

export type RenameFailure = OpenFailure | { readonly kind: 'save-failed'; readonly message: string }

export type RenameResult =
  | { readonly ok: true; readonly renamed: boolean }
  | { readonly ok: false; readonly failure: RenameFailure }

function savedOrFailed(outcome: Awaited<ReturnType<DocumentHandle['save']>>): RenameResult {
  return outcome.ok
    ? { ok: true, renamed: true }
    : { ok: false, failure: { kind: 'save-failed', message: outcome.message } }
}

/** Renames in the session that is open now. The command goes in before the first await. */
async function renameOpenProject(current: DocumentHandle, name: string): Promise<RenameResult> {
  current.session.dispatch(renameProjectCommand(name))
  return savedOrFailed(await current.save())
}

/**
 * Renames a project that is not open: opens a handle on it, renames, saves, and closes the handle.
 * The handle is closed also when the rename threw (the save never throws), so its lock is free
 * afterward, unless the close fails too. A session listener that throws after the rename applied
 * still gives storage-unavailable, though the close stores the new name.
 */
async function renameClosedProject(
  ports: SessionPorts,
  id: string,
  name: string,
): Promise<RenameResult> {
  const target = await recentTarget(ports, id)
  if (!target.ok) {
    return target
  }
  const opened = await openDocumentHandle(ports, target.request, { leaveSnapshots: true })
  if (!opened.ok) {
    return opened
  }
  const { handle } = opened
  let saved: RenameResult
  try {
    handle.session.dispatch(renameProjectCommand(name))
    saved = savedOrFailed(await handle.save())
  } catch (error) {
    await handle.close()
    throw error
  }
  const closed = savedOrFailed(await handle.close())
  return saved.ok ? closed : saved
}

/**
 * Renames the project of the id. A blank name changes nothing. The open project is renamed in its
 * session and saved; any other project is opened without an editor, renamed, saved, and closed.
 * The promise never rejects.
 */
export async function renameProject(
  ports: SessionPorts,
  current: DocumentHandle | undefined,
  { id, name }: RenameRequest,
): Promise<RenameResult> {
  const trimmed = name.trim()
  if (trimmed === '') {
    return { ok: true, renamed: false }
  }
  try {
    return current?.id === id
      ? await renameOpenProject(current, trimmed)
      : await renameClosedProject(ports, id, trimmed)
  } catch (error) {
    return storageUnavailable(error)
  }
}
