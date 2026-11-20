/**
 * The mark of a session: a way to tell, later, whether the session changed since the mark was
 * taken. It describes the session, not any one record, so it lives apart from the record queue
 * that uses it and from the handle code that takes it.
 */
import type { EditorSession } from '../editor-session/editor-session'

/**
 * A session at the moment of a record request. The session's project is live, so the record is
 * made from it only while `unchanged` holds: then it is still the state that the store holds.
 */
export interface SessionMark {
  readonly session: EditorSession
  /** True while the session has made no change since the mark was taken. */
  readonly unchanged: () => boolean
}

/** The count of the changes of each session that a record was asked for. */
const changeCounts = new WeakMap<EditorSession, { value: number }>()

/** The count of the changes of the session since its first record request. */
function changeCountOf(session: EditorSession): { value: number } {
  const known = changeCounts.get(session)
  if (known !== undefined) {
    return known
  }
  const count = { value: 0 }
  session.subscribe(() => {
    count.value += 1
  })
  changeCounts.set(session, count)
  return count
}

/** Marks the session as it is now, so that a later record can tell whether it changed. */
export function markSession(session: EditorSession): SessionMark {
  const count = changeCountOf(session)
  const markedAt = count.value
  return { session, unchanged: () => count.value === markedAt }
}
