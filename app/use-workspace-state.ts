import { useEffect, useMemo, useRef, useState } from 'react'
import { createActiveFloorStore, createSelectionStore } from '../bridge'
import {
  displayNameOf,
  guardDestructive,
  reconcileIndex,
  recentRecords,
  restoreSnapshot,
  type DocumentHandle,
  type FlowResult,
  type ProjectSnapshots,
  type RestoreRefusal,
  type SaveStatus,
  type SessionPorts,
} from '../session'
import { useNotifications } from '../editor/design-system'
import type { EditorWorkspaceProps } from './app'
import { createAssetLibrary } from './create-asset-library-registry'
import { useSaveStatus, useUnsavedChangesGuard } from './use-before-unload-guard'
import { useDiscardConfirmation } from './use-discard-confirmation'
import { useFlushOnHidden } from './use-flush-on-hidden'
import { useHandleNotices } from './use-handle-notices'
import { useLatest } from './use-latest'
import type { RunFlow } from './use-open-project'
import { useProjectActions } from './use-project-actions'
import { useSwitchNotices } from './use-switch-notices'

// The per-render state EditorWorkspace renders from: the context stores, the asset
// library, the save status, the recent list and the recovery prompt, the file-menu
// actions, and the discard dialog's request plus its resolver. Lifted out of the
// component so the component reads as the provider tree it renders rather than the
// hook wiring behind it.
export interface WorkspaceState {
  selection: ReturnType<typeof createSelectionStore>
  activeFloorStore: ReturnType<typeof createActiveFloorStore>
  assetLibrary: ReturnType<typeof createAssetLibrary>
  saveStatus: SaveStatus
  recentEntries: RecentEntry[]
  recovery: Recovery | null
  actions: ReturnType<typeof useProjectActions>
  discardRequest: ReturnType<typeof useDiscardConfirmation>['discardRequest']
  resolveDiscard: ReturnType<typeof useDiscardConfirmation>['resolveDiscard']
}

/** What the Project menu shows for one recent project. */
export interface RecentEntry {
  id: string
  name: string
}

export interface Recovery {
  // Callers fire-and-forget (both are wired straight to an onClick); the Promise
  // arm only lets hook-level tests await the restore or the prune.
  onRestore: () => void | Promise<void>
  onDiscard: () => void | Promise<void>
}

async function readRecentEntries(ports: SessionPorts, openId: string): Promise<RecentEntry[]> {
  const records = recentRecords(await reconcileIndex(ports), openId)
  return records.map((record) => ({ id: record.id, name: displayNameOf(record) }))
}

// The projects used last, apart from the open one, read from the index for each pair of ports and
// handle. Both runs of the effect under StrictMode share one rebuild, because overlapping calls of
// `reconcileIndex` share a run. A read that ends after its ports or its handle were replaced sets
// nothing. The rebuild never rejects.
function useRecentEntries(ports: SessionPorts, handle: DocumentHandle): RecentEntry[] {
  const [recentEntries, setRecentEntries] = useState<RecentEntry[]>([])
  useEffect(() => {
    let cancelled = false
    void readRecentEntries(ports, handle.id).then((entries) => {
      if (!cancelled) setRecentEntries(entries)
    })
    return () => {
      cancelled = true
    }
  }, [ports, handle])
  return recentEntries
}

/** The restore of a recovered copy: it needs an open project, and with none has nothing to do. */
function restoreInto(current: DocumentHandle | undefined): Promise<FlowResult<RestoreRefusal>> {
  if (current === undefined) {
    return Promise.resolve({ ok: false, failure: { kind: 'nothing-to-restore' } })
  }
  return restoreSnapshot(current)
}

interface CrashRecoveryContext {
  handle: DocumentHandle
  runFlow: RunFlow
  confirmDiscard: () => Promise<boolean>
  /** The handles whose recovered work was offered already, by any mount of the editor. */
  offered: WeakSet<DocumentHandle> | undefined
}

/** Offers a recovery only while the snapshots still hold a copy that can be restored. */
async function dismissUnlessRecoverable(
  snapshots: ProjectSnapshots,
  dismiss: () => void,
): Promise<void> {
  try {
    if (!(await snapshots.isRecoverable())) {
      dismiss()
    }
  } catch (error) {
    console.error('checking for a recovered copy failed', error)
  }
}

interface RecoveryHandlersContext extends Omit<CrashRecoveryContext, 'handle' | 'offered'> {
  snapshots: ProjectSnapshots
  dismiss: () => void
  isLive: () => boolean
  readUnsaved: () => boolean
  notify: ReturnType<typeof useSwitchNotices>
}

// Builds the restore and discard handlers, each guarded so they never touch React state
// after the owning effect has been torn down.
function buildRecovery(context: RecoveryHandlersContext): Recovery {
  const { snapshots, runFlow, confirmDiscard, dismiss, isLive, readUnsaved, notify } = context
  return {
    // The restore replaces the open document with the recovered one, so unsaved work
    // goes through the unsaved-changes prompt first. The owner hands the flow its project.
    onRestore: () =>
      guardDestructive({
        isDirty: readUnsaved(),
        confirm: confirmDiscard,
        run: async () => {
          const result = await runFlow<RestoreRefusal>((_ports, current) => restoreInto(current))
          if (result === undefined || !isLive()) {
            return
          }
          if (result.ok || result.failure.kind === 'nothing-to-restore') {
            dismiss()
            return
          }
          notify(result, { action: 'Restore' })
          if (result.failure.kind === 'did-not-restore') {
            await dismissUnlessRecoverable(snapshots, dismiss)
          }
        },
      }),
    // Pruning deletes every recovered snapshot, so it is gated behind the ADR-0104
    // confirm seam: prune (and clear recovery) only when the user confirms.
    onDiscard: () =>
      confirmDiscard()
        .then((confirmed) => {
          if (!confirmed) {
            return
          }
          return snapshots.prune().then(() => {
            if (isLive()) {
              dismiss()
            }
          })
        })
        // A prune I/O failure (disk full, OPFS error, permission loss) is logged
        // rather than swallowed; the recovered snapshots survive so the user can
        // retry the discard.
        .catch((error: unknown) => console.error('discard snapshots failed', error)),
  }
}

/** The recovery prompt, with the snapshots it was built for. */
interface RecoveryAnswer {
  snapshots: ProjectSnapshots
  recovery: Recovery | null
}

// Asks the snapshots of the open project once whether a recovered copy exists and, when one
// does, publishes the prompt's handlers. A project with other snapshots asks again and drops the
// old answer. A restore keeps the snapshots of its project, so it does not ask again. A handle
// whose recovered work an earlier mount of the editor offered is not offered again.
function useCrashRecovery(context: CrashRecoveryContext): Recovery | null {
  const { handle, runFlow, confirmDiscard, offered } = context
  const offeredHere = useRef<DocumentHandle | null>(null)
  const notify = useSwitchNotices()
  const [answer, setAnswer] = useState<RecoveryAnswer | null>(null)
  // Set in a layout effect, so a restore before the passive effects reads the committed handle.
  const latestHandle = useLatest(handle)
  const snapshots = handle.snapshots
  useEffect(() => {
    const current = latestHandle.current
    if (offered?.has(current) === true && offeredHere.current !== current) return
    let cancelled = false
    const isLive = () => !cancelled
    const dismiss = () => setAnswer({ snapshots, recovery: null })
    const readUnsaved = () => isUnsaved(latestHandle.current.saveStatus())
    const handlers = { snapshots, runFlow, confirmDiscard, dismiss, isLive, readUnsaved, notify }
    void snapshots.isRecoverable().then(
      (recoverable) => {
        if (!isLive() || !recoverable) return
        offered?.add(current)
        offeredHere.current = current
        setAnswer({ snapshots, recovery: buildRecovery(handlers) })
      },
      (error: unknown) => console.error('checking for a recovered copy failed', error),
    )
    return () => {
      cancelled = true
    }
  }, [snapshots, latestHandle, runFlow, confirmDiscard, notify, offered])
  return answer?.snapshots === snapshots ? answer.recovery : null
}

function isUnsaved(status: SaveStatus): boolean {
  return status === 'pending' || status === 'error'
}

export function useWorkspaceState(props: EditorWorkspaceProps): WorkspaceState {
  const { handle, runFlow, libraryAssets, ports, capabilities } = props
  const session = handle.session
  // A selection names walls and openings inside one project, so the store belongs to
  // one session: New, Open, and restore all bring a new handle with a new session, in
  // which those ids mean nothing, and a surviving store would describe a phantom object.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the session is this memo's key, not an input the factory reads.
  const selection = useMemo(() => createSelectionStore(), [session])
  const activeFloorStore = useMemo(
    () => createActiveFloorStore(session.getProject().floors[0]?.id ?? null),
    [session],
  )
  // The handle saves; the workspace shows its status and its notices, warns before a leave, and
  // asks for a write when the page hides.
  const saveStatus = useSaveStatus(handle)
  useUnsavedChangesGuard(handle)
  useFlushOnHidden(handle)
  useHandleNotices(handle)
  const { discardRequest, confirmDiscard, resolveDiscard } = useDiscardConfirmation()
  const recentEntries = useRecentEntries(ports, handle)
  const offered = props.offeredRecovery
  const recovery = useCrashRecovery({ handle, runFlow, confirmDiscard, offered })
  const notifications = useNotifications()
  // The asset library (starter pack + user imports), assembled once for the pool of the library.
  const assetLibrary = useMemo(() => createAssetLibrary(libraryAssets), [libraryAssets])
  const { showProjects } = props
  const actions = useProjectActions({
    handle,
    runFlow,
    capabilities,
    notifications,
    packs: assetLibrary.registry,
    ...(showProjects === undefined ? {} : { showProjects }),
  })
  return {
    selection,
    activeFloorStore,
    assetLibrary,
    saveStatus,
    recentEntries,
    recovery,
    actions,
    discardRequest,
    resolveDiscard,
  }
}
