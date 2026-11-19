import { useCallback } from 'react'
import { guardDestructive } from '../bridge'
import type { DocumentHandle, FolderRefusal, ImportFailure, RestoreRefusal } from '../session'
import {
  recentEntryFor,
  type ProjectBackend,
  type RecentProjectStore,
  type StorageCapabilities,
} from '../storage'
import type { Flow, RunFlow } from './use-open-project'
import { useLatest } from './use-latest'
import { useSwitchNotices, type FlowNoticeOptions } from './use-switch-notices'

/**
 * Map the resolved default store to a recent-list backend. The recent-list
 * `ProjectBackend` union has no `'indexeddb'` member, so only the OPFS default
 * earns a recent entry; the IndexedDB default stays the implicit current project
 * and records nothing on boot. The clean mapping is finalized when the create-time
 * backend chooser lands (see the plan's Open questions on backend memory).
 */
function defaultStoreBackend(capabilities: StorageCapabilities): ProjectBackend | null {
  return capabilities.opfs ? 'opfs' : null
}

/** What the recent list records for one project. */
export interface RecentInput {
  id: string
  name: string
  backend: ProjectBackend
}

/** Record an opened-or-saved project under the given backend, ignoring failures. */
function recordRecent(recentProjects: RecentProjectStore, input: RecentInput): void {
  void Promise.resolve()
    .then(() =>
      recentProjects.record(
        recentEntryFor({
          id: input.id,
          name: input.name,
          backend: input.backend,
          openedAt: Date.now(),
        }),
      ),
    )
    .catch(() => undefined)
}

/**
 * The recent entry of the project that the handle holds, or null where no backend is known: a
 * folder project is a folder, and a workspace project takes the backend of the default store.
 */
export function recentInputOf(
  handle: DocumentHandle,
  capabilities: StorageCapabilities,
): RecentInput | null {
  const backend =
    handle.location.kind === 'folder' ? 'file-system-folder' : defaultStoreBackend(capabilities)
  if (backend === null) {
    return null
  }
  return { id: handle.id, name: handle.session.getProject().meta.name, backend }
}

/** Records the project, when its recent entry has a backend. */
export function recordProject(recentProjects: RecentProjectStore, input: RecentInput | null): void {
  if (input !== null) {
    recordRecent(recentProjects, input)
  }
}

/** What an adapter needs to run a flow that may replace the open project. */
export interface SwitchFlowContext {
  handle: DocumentHandle
  runFlow: RunFlow
  recentProjects: RecentProjectStore
  capabilities: StorageCapabilities
}

/** The refusals that a flow which replaces the open project can give. */
type SwitchRefusal = ImportFailure | FolderRefusal | RestoreRefusal

/** How a switch records and reports what its flow gave. */
export interface SwitchOptions extends FlowNoticeOptions {
  /**
   * Whether the project that the flow opened gets a recent entry. Default true. A flow that opens
   * a project which is not stored yet sets it to false: an entry for that project could not be
   * opened. The first save of the project, or a later switch that leaves it, records it.
   */
  readonly recordOpened?: boolean
}

/** Runs a flow through the owner, then records and reports what it gave. */
export type RunSwitch = <Refusal extends SwitchRefusal = never>(
  flow: Flow<Refusal>,
  options?: SwitchOptions,
) => Promise<void>

/**
 * Gives a function that runs a flow through the owner. It reads the project that is open before
 * the flow runs. After a flow that opened a project it records both that project and the one that
 * was left, unless the options turn off the record of the opened one; a result of any kind is then
 * shown. A flow that the owner did not run records and shows nothing. The open project is read from
 * the latest render, also for a Retry of a toast.
 */
export function useSwitchFlow(context: SwitchFlowContext): RunSwitch {
  const { handle, runFlow, recentProjects, capabilities } = context
  const notify = useSwitchNotices()
  // Set in a layout effect, so a Retry before the passive effects reads the committed handle.
  const latestHandle = useLatest(handle)
  return useCallback(
    async <Refusal extends SwitchRefusal = never>(flow: Flow<Refusal>, options?: SwitchOptions) => {
      const { recordOpened = true, ...noticeOptions } = options ?? {}
      const left = recentInputOf(latestHandle.current, capabilities)
      const result = await runFlow(flow)
      if (result?.ok === true) {
        recordProject(recentProjects, left)
        if (recordOpened) {
          recordProject(recentProjects, recentInputOf(result.handle, capabilities))
        }
      }
      notify(result, noticeOptions)
    },
    [latestHandle, runFlow, recentProjects, capabilities, notify],
  )
}

/** The unsaved-work half of an actions context: what the discard guard reads. */
export interface DiscardGuardSeam {
  isDirty: boolean | undefined
  confirmDiscard: (() => boolean | Promise<boolean>) | undefined
}

/**
 * Run a step that replaces the open document behind the ADR-0104 unsaved-work
 * prompt. The restore of a recovered copy is the one caller: the actions that
 * open another project store the unsaved change first and ask nothing. A seam
 * carrying neither half (hook-level tests) reads as clean and runs the step
 * straight away.
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
