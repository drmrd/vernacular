import { guardDestructive } from '../bridge'
import {
  recentEntryFor,
  type ProjectBackend,
  type RecentProjectStore,
  type StorageCapabilities,
} from '../storage'

/**
 * Map the resolved default store to a recent-list backend. The recent-list
 * `ProjectBackend` union has no `'indexeddb'` member, so only the OPFS default
 * earns a recent entry; the IndexedDB default stays the implicit current project
 * and records nothing on boot. The clean mapping is finalized when the create-time
 * backend chooser lands (see the plan's Open questions on backend memory).
 */
export function defaultStoreBackend(capabilities: StorageCapabilities): ProjectBackend | null {
  return capabilities.opfs ? 'opfs' : null
}

/** Record an opened-or-saved project under the given backend, ignoring failures. */
export function recordRecent(
  recentProjects: RecentProjectStore,
  input: { id: string; name: string; backend: ProjectBackend },
): void {
  void recentProjects.record(
    recentEntryFor({
      id: input.id,
      name: input.name,
      backend: input.backend,
      openedAt: Date.now(),
    }),
  )
}

/** The unsaved-work half of an actions context: what the discard guard reads. */
export interface DiscardGuardSeam {
  isDirty: boolean | undefined
  confirmDiscard: (() => boolean | Promise<boolean>) | undefined
}

/**
 * Replace the live session behind the ADR-0104 unsaved-work prompt. Every action
 * that swaps the session (New, Open folder, Open recent, Open file, restore)
 * routes through here, so one destructive click prompts at most once. A context
 * carrying neither half of the seam (hook-level tests, hosts that track no dirty
 * state) reads as clean and runs the swap straight away.
 */
export function guardSessionSwap(
  seam: DiscardGuardSeam,
  run: () => void | Promise<void>,
): Promise<void> {
  return guardDestructive({
    isDirty: seam.isDirty ?? false,
    confirm: seam.confirmDiscard ?? (() => true),
    run,
  })
}
