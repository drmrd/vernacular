import { callGuarded } from '../guarded-call'
import type { HandleNotice } from './handle-types'

/** The notices of one handle: each kind is raised once and delivered once. */
export interface HandleNotices {
  /** Delivers the notice to every listener now, or holds it for the next listener. */
  raise(notice: HandleNotice): void
  /** Adds a listener, and gives it every held notice before this returns. */
  onNotice(listener: (notice: HandleNotice) => void): () => void
}

type NoticeListener = (notice: HandleNotice) => void

function deliver(listener: NoticeListener, notice: HandleNotice): void {
  callGuarded(() => listener(notice))
}

/** Notices with no listener yet and no notice raised. */
export function createHandleNotices(): HandleNotices {
  const listeners = new Set<NoticeListener>()
  const raised = new Set<HandleNotice>()
  let held: HandleNotice[] = []

  return {
    raise(notice) {
      if (raised.has(notice)) {
        return
      }
      raised.add(notice)
      if (listeners.size === 0) {
        held.push(notice)
        return
      }
      for (const listener of [...listeners]) {
        deliver(listener, notice)
      }
    },
    onNotice(listener) {
      listeners.add(listener)
      const toDeliver = held
      held = []
      for (const notice of toDeliver) {
        deliver(listener, notice)
      }
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
