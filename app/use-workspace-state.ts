import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createActiveFloorStore,
  createEditorSession,
  createSelectionStore,
  useAutosave,
  useDirtyTracker,
  type AutosaveStatus,
  type EditorSession,
} from '../bridge'
import { orderRecentProjects, type RecentProjectStore } from '../storage'
import { useNotifications } from '../editor/design-system'
import type { EditorWorkspaceProps, SnapshotsPort } from './app'
import { createAssetLibrary } from './create-asset-library-registry'
import { useBeforeUnloadGuard } from './use-before-unload-guard'
import { useDiscardConfirmation } from './use-discard-confirmation'
import { guardSessionSwap, useProjectActions, type RecentEntry } from './use-project-actions'

// The per-render state EditorWorkspace renders from: the context stores, the asset
// library, autosave/recent/recovery status, the file-menu actions, and the discard
// dialog's request plus its resolver. Lifted out of the component so the component
// reads as the provider tree it renders rather than the hook wiring behind it.
export interface WorkspaceState {
  selection: ReturnType<typeof createSelectionStore>
  activeFloorStore: ReturnType<typeof createActiveFloorStore>
  assetLibrary: ReturnType<typeof createAssetLibrary>
  saveStatus: AutosaveStatus
  recentEntries: ReturnType<typeof useRecentProjectsAndRecovery>['recentEntries']
  recovery: ReturnType<typeof useRecentProjectsAndRecovery>['recovery']
  actions: ReturnType<typeof useProjectActions>
  discardRequest: ReturnType<typeof useDiscardConfirmation>['discardRequest']
  resolveDiscard: ReturnType<typeof useDiscardConfirmation>['resolveDiscard']
}

export interface Recovery {
  // Callers fire-and-forget (both are wired straight to an onClick); the Promise
  // arm only lets hook-level tests await the restore or the prune.
  onRestore: () => void | Promise<void>
  onDiscard: () => void | Promise<void>
}

export interface RecentAndRecoveryContext {
  recentProjects: RecentProjectStore
  snapshots: SnapshotsPort | undefined
  onSession: (session: EditorSession) => void

  /** Prompt the user before discarding recovered snapshots, or before a restore
   *  replaces unsaved work. Returns or resolves true to proceed, false to keep
   *  what is there. Sync or async, mirroring the ADR-0104
   *  ProjectActionsContext.confirmDiscard seam. Discard never prunes when omitted. */
  confirmDiscard?: () => boolean | Promise<boolean>

  /** Whether the live session has unsaved changes. Restore replaces that session
   *  with the recovered project, so it prompts through the same seam as New and
   *  Open. Treated as clean (false) when omitted. */
  isDirty?: boolean
}

export function useRecentProjectsAndRecovery(context: RecentAndRecoveryContext): {
  recentEntries: RecentEntry[]
  recovery: Recovery | null
} {
  return {
    recentEntries: useRecentEntries(context.recentProjects),
    recovery: useCrashRecovery(context),
  }
}

// The most-recently-opened list, read once per store. Independent of crash
// recovery below: the two only ever shared an effect, never any state.
function useRecentEntries(recentProjects: RecentProjectStore): RecentEntry[] {
  const [recentEntries, setRecentEntries] = useState<RecentEntry[]>([])
  useEffect(() => {
    let cancelled = false
    void recentProjects.list().then((entries) => {
      if (!cancelled) {
        setRecentEntries(
          orderRecentProjects(entries).map(({ id, name, backend }) => ({ id, name, backend })),
        )
      }
    })
    return () => {
      cancelled = true
    }
  }, [recentProjects])
  return recentEntries
}

// Probes the snapshot store once and, when work is recoverable, publishes the
// banner's restore/discard handlers. Null means nothing to recover (or the user
// has already dealt with it).
function useCrashRecovery(context: RecentAndRecoveryContext): Recovery | null {
  const { snapshots, onSession, confirmDiscard, isDirty } = context
  const [recovery, setRecovery] = useState<Recovery | null>(null)

  // The restore handler reads the dirty flag through a ref rather than an effect
  // dependency: re-running the effect on every edit would re-probe the snapshot
  // store and could resurrect a banner the user has already dealt with.
  const isDirtyRef = useRef(false)
  useEffect(() => {
    isDirtyRef.current = isDirty ?? false
  }, [isDirty])

  useEffect(() => {
    if (!snapshots) {
      return
    }
    let cancelled = false
    const isLive = () => !cancelled
    void snapshots.isRecoverable().then((recoverable) => {
      if (isLive() && recoverable) {
        const readIsDirty = () => isDirtyRef.current
        setRecovery(
          buildRecovery({ snapshots, onSession, setRecovery, isLive, confirmDiscard, readIsDirty }),
        )
      }
    })
    return () => {
      cancelled = true
    }
  }, [snapshots, onSession, confirmDiscard])

  return recovery
}

interface RecoveryHandlersContext {
  snapshots: SnapshotsPort
  onSession: (session: EditorSession) => void
  setRecovery: (recovery: Recovery | null) => void
  isLive: () => boolean
  confirmDiscard: (() => boolean | Promise<boolean>) | undefined
  readIsDirty: () => boolean
}

// Builds the restore/discard handlers, each guarded so they never touch React state
// after the owning effect has been torn down.
function buildRecovery(context: RecoveryHandlersContext): Recovery {
  const { snapshots, onSession, setRecovery, isLive, confirmDiscard, readIsDirty } = context
  return {
    // Restoring swaps the recovered project in over the live one, so unsaved work
    // goes through the same prompt New and Open use before it is replaced.
    onRestore: () =>
      guardSessionSwap({ isDirty: readIsDirty(), confirmDiscard }, () =>
        snapshots.restore().then((project) => {
          if (!isLive()) {
            return
          }
          if (project) {
            onSession(createEditorSession(project))
          }
          setRecovery(null)
        }),
      ),
    // Pruning deletes every autosave file including session-start, so it is
    // gated behind the ADR-0104 confirm seam: prune (and clear recovery) only
    // when the user confirms, otherwise leave the recovered snapshots intact.
    onDiscard: () =>
      Promise.resolve(confirmDiscard ? confirmDiscard() : false)
        .then((confirmed) => {
          if (!confirmed) {
            return
          }
          return snapshots.prune().then(() => {
            if (isLive()) {
              setRecovery(null)
            }
          })
        })
        // A prune I/O failure (disk full, OPFS error, permission loss) is logged
        // rather than swallowed; the recovered snapshots survive so the user can
        // retry the discard. Mirrors the reopen-folder failure pattern in
        // use-project-actions.ts.
        .catch((error: unknown) => console.error('discard snapshots failed', error)),
  }
}

interface SaveStatusOptions {
  session: EditorWorkspaceProps['session']
  store: EditorWorkspaceProps['store']
  projectId: EditorWorkspaceProps['projectId']
  snapshots?: EditorWorkspaceProps['snapshots']
  revision: ReturnType<typeof useDirtyTracker>['revision']
  markSavedRevision: ReturnType<typeof useDirtyTracker>['markSavedRevision']
}

// Owns the save-status indicator the autosave and the explicit save share. Autosave
// disarms the guard for exactly the revision it persisted; an explicit save pulses the
// same status to saved (flush-and-confirm via Cmd+S / menu).
function useSaveStatus(options: SaveStatusOptions): {
  saveStatus: AutosaveStatus
  reportSaved: () => void
} {
  const { session, store, projectId, snapshots, revision, markSavedRevision } = options
  const [saveStatus, setSaveStatus] = useState<AutosaveStatus>('idle')
  useAutosave({
    session,
    store,
    projectId,
    onStatusChange: setSaveStatus,
    revision,
    onSaved: markSavedRevision,
    // Spread snapshots only when present: under exactOptionalPropertyTypes the optional
    // option rejects an explicit undefined.
    ...(snapshots ? { snapshots } : {}),
  })
  const reportSaved = useCallback(() => setSaveStatus('saved'), [])
  return { saveStatus, reportSaved }
}

interface WorkspaceActionsOptions {
  props: EditorWorkspaceProps
  recentEntries: WorkspaceState['recentEntries']
  isDirty: ReturnType<typeof useDirtyTracker>['isDirty']
  confirmDiscard: ReturnType<typeof useDiscardConfirmation>['confirmDiscard']
  revision: ReturnType<typeof useDirtyTracker>['revision']
  markSavedRevision: ReturnType<typeof useDirtyTracker>['markSavedRevision']
}

// Owns the save-status indicator plus the file-menu actions that share it: the
// explicit save reports through the same status the autosave drives, and the actions
// raise their outcomes through the notification channel. Kept apart so
// useWorkspaceState reads as the provider-tree wiring rather than the hook plumbing.
function useWorkspaceActions(options: WorkspaceActionsOptions): {
  saveStatus: AutosaveStatus
  actions: ReturnType<typeof useProjectActions>
} {
  const { props, recentEntries, isDirty, confirmDiscard, revision, markSavedRevision } = options
  const { session, store, projectId, snapshots } = props
  const { saveStatus, reportSaved } = useSaveStatus({
    session,
    store,
    projectId,
    snapshots,
    revision,
    markSavedRevision,
  })
  const notifications = useNotifications()
  const actions = useProjectActions({
    ...props,
    recentEntries,
    isDirty,
    confirmDiscard,
    revision,
    markSavedRevision,
    reportSaved,
    notifications,
  })
  return { saveStatus, actions }
}

export function useWorkspaceState(props: EditorWorkspaceProps): WorkspaceState {
  const { session, assets, recentProjects, snapshots, onSession } = props
  const selection = useMemo(() => createSelectionStore(), [])
  const activeFloorStore = useMemo(
    () => createActiveFloorStore(session.getProject().floors[0]?.id ?? null),
    [session],
  )
  const { isDirty, revision, markSavedRevision } = useDirtyTracker(session)
  // Arm the browser-native leave warning while the workspace has unsaved changes.
  useBeforeUnloadGuard(isDirty)
  const { discardRequest, confirmDiscard, resolveDiscard } = useDiscardConfirmation()
  const { recentEntries, recovery } = useRecentProjectsAndRecovery({
    recentProjects,
    snapshots,
    onSession,
    confirmDiscard,
    isDirty,
  })
  const { saveStatus, actions } = useWorkspaceActions({
    props,
    recentEntries,
    isDirty,
    confirmDiscard,
    revision,
    markSavedRevision,
  })
  // The asset library (starter pack + user imports), assembled once per content cache.
  const assetLibrary = useMemo(() => createAssetLibrary(assets), [assets])
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
