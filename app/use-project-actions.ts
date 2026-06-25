import { useCallback, useEffect, useState } from 'react'
import { commitProject, createEditorSession, guardDestructive, type EditorSession } from '../bridge'
import {
  DirectoryHandleStore,
  FileSystemFolderProjectStore,
  orderRecentProjects,
  recentEntryFor,
  type AssetCache,
  type ProjectBackend,
  type ProjectStore,
  type RecentProjectStore,
  type StorageCapabilities,
} from '../storage'
import { type NotificationApi } from '../editor/design-system'
import { createInitialProject } from './create-initial-project'
import { failureMessage } from './failure-message'
import {
  useExportBundleAction,
  useExportImageAction,
  useExportPdfAction,
  useExportPlanAction,
} from './use-export-actions'
import { useOpenFileAction } from './use-open-file-action'
import type { SnapshotsPort } from './app'

export interface RecentEntry {
  id: string
  name: string
  backend: ProjectBackend
}

export interface Recovery {
  onRestore: () => void
  // Callers fire-and-forget (wired straight to an onClick); the Promise arm only
  // lets hook-level tests await prune completion.
  onDiscard: () => void | Promise<void>
}

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

export interface ProjectActionsContext {
  session: EditorSession
  store: ProjectStore
  assets: AssetCache
  projectId: string
  snapshots: SnapshotsPort | undefined
  recentProjects: RecentProjectStore
  capabilities: StorageCapabilities
  recentEntries: RecentEntry[]
  onSession: (session: EditorSession) => void
  notifications: NotificationApi

  /** Whether the live session has unsaved changes since the last save/load.
   *  Source: the dirty tracker (bridge/session/create-dirty-tracker.ts) via
   *  the app-layer useDirtyState hook. Treated as clean (false) when omitted. */
  isDirty?: boolean

  /** Prompt the user to discard unsaved work before a destructive swap.
   *  Resolves true to proceed, false/falsy to cancel. Sync or async, matching
   *  GuardDestructiveOptions.confirm exactly. Only consulted when isDirty is
   *  true (per needsDiscardConfirmation). */
  confirmDiscard?: () => boolean | Promise<boolean>

  /** Reads the dirty-tracker revision, captured when an explicit save begins so the
   *  guard disarms for exactly the persisted revision (ADR-0104). Absent => not captured. */
  revision?: () => number

  /** Clears the dirty baseline for a captured revision after an explicit save commits.
   *  Source: useDirtyTracker. Optional so hook-level tests stay valid. */
  markSavedRevision?: (revision: number) => void

  /** Pulses the save-status indicator to "saved" after an explicit save commits, so
   *  Cmd+S and the menu Save give visible confirmation. Optional. */
  reportSaved?: () => void
}

// Runs an async file operation and, on failure, raises an error toast whose
// Retry re-invokes the same operation through this helper (so Retry retries).
// The action label produces the unified "<Action> failed: <reason>" prefix.
function runWithErrorToast(
  notifications: NotificationApi,
  action: string,
  op: () => Promise<void>,
): void {
  void op().catch((error: unknown) => {
    notifications.error(failureMessage(action, error), {
      actions: [{ label: 'Retry', onAction: () => runWithErrorToast(notifications, action, op) }],
    })
  })
}

export interface ProjectActions {
  onSave: () => void
  onOpenRecent: (id: string) => void
  onNewProject: () => void | Promise<void>
  onExportBundle: () => void
  onExportPlan: () => void
  onExportImage: () => void
  onExportPdf: () => void
  onOpenFolder?: () => void
  onImportDroppedFile?: (file: File) => void | Promise<void>
  onOpenFile?: () => void
}

export function useProjectActions(context: ProjectActionsContext): ProjectActions {
  return {
    onSave: useSaveAction(context),
    onOpenRecent: useOpenRecentAction(context),
    onNewProject: useNewProjectAction(context),
    onExportBundle: useExportBundleAction(context),
    onExportPlan: useExportPlanAction(context),
    onExportImage: useExportImageAction(context),
    onExportPdf: useExportPdfAction(context),
    ...useOpenFolderAction(context),
    ...useOpenFileAction(context),
  }
}

function useSaveAction(context: ProjectActionsContext): () => void {
  const {
    session,
    store,
    projectId,
    snapshots,
    recentProjects,
    capabilities,
    revision,
    markSavedRevision,
    reportSaved,
    notifications,
  } = context
  const backend = defaultStoreBackend(capabilities)
  return useCallback(() => {
    // Capture the revision synchronously, before the async save begins: an edit
    // arriving mid-save advances the live revision, so marking the captured one
    // keeps the later edit dirty (no save/edit race).
    const savedRevision = revision?.()
    runWithErrorToast(notifications, 'Save', async () => {
      const project = session.getProject()
      await commitProject({ store, projectId, project, ...(snapshots ? { snapshots } : {}) })
      if (backend !== null) {
        recordRecent(recentProjects, { id: projectId, name: project.meta.name, backend })
      }
      // A successful explicit save is the clean baseline for the captured revision
      // and pulses the status to saved (flush-and-confirm).
      if (savedRevision !== undefined) {
        markSavedRevision?.(savedRevision)
      }
      reportSaved?.()
    })
  }, [
    session,
    store,
    projectId,
    snapshots,
    recentProjects,
    backend,
    revision,
    markSavedRevision,
    reportSaved,
    notifications,
  ])
}

function useNewProjectAction(context: ProjectActionsContext): () => void | Promise<void> {
  const { onSession, isDirty, confirmDiscard } = context
  return useCallback(
    () =>
      guardDestructive({
        isDirty: isDirty ?? false,
        confirm: confirmDiscard ?? (() => true),
        run: () => onSession(createEditorSession(createInitialProject())),
      }),
    [onSession, isDirty, confirmDiscard],
  )
}

// Open folder is gated on the native picker capability; without it the shell
// renders no control, so the handler is omitted rather than rendered inert.
function useOpenFolderAction(context: ProjectActionsContext): { onOpenFolder?: () => void } {
  const { projectId, recentProjects, capabilities, onSession, notifications } = context
  const onOpenFolder = useCallback(() => {
    runWithErrorToast(notifications, 'Open', async () => {
      const store = await FileSystemFolderProjectStore.open(projectId, new DirectoryHandleStore())
      const project = await store.load(projectId)
      onSession(createEditorSession(project))
      recordRecent(recentProjects, {
        id: projectId,
        name: project.meta.name,
        backend: 'file-system-folder',
      })
    })
  }, [projectId, recentProjects, onSession, notifications])
  return capabilities.fileSystemAccess ? { onOpenFolder } : {}
}

function useOpenRecentAction(context: ProjectActionsContext): (id: string) => void {
  const { store, projectId, recentEntries, onSession, notifications } = context
  return useCallback(
    (id: string) => {
      const entry = recentEntries.find((candidate) => candidate.id === id)
      if (entry?.backend === 'file-system-folder') {
        openFolderRecent({ id, projectId, onSession, fallback: store, notifications })
        return
      }
      // OPFS, zip-bundle, or no recorded backend route through the default store
      // load; per-backend reopen for the others is deferred (plan Open questions).
      runWithErrorToast(notifications, 'Open', async () => {
        const project = await store.load(id)
        onSession(createEditorSession(project))
      })
    },
    [store, projectId, recentEntries, onSession, notifications],
  )
}

interface OpenFolderRecentContext {
  id: string
  projectId: string
  onSession: (session: EditorSession) => void
  fallback: ProjectStore
  notifications: NotificationApi
}

// Reopen a picked folder, re-requesting permission; falls back to the default
// store load when no stored handle exists or permission is denied (spec 5.7).
function openFolderRecent(context: OpenFolderRecentContext): void {
  const { id, projectId, onSession, fallback, notifications } = context
  runWithErrorToast(notifications, 'Open', async () => {
    const reopenedStore = await FileSystemFolderProjectStore.reopen(id, new DirectoryHandleStore())
    if (reopenedStore === undefined) {
      const project = await fallback.load(id)
      onSession(createEditorSession(project))
      return
    }
    const project = await reopenedStore.load(projectId)
    onSession(createEditorSession(project))
  })
}

export interface RecentAndRecoveryContext {
  recentProjects: RecentProjectStore
  snapshots: SnapshotsPort | undefined
  onSession: (session: EditorSession) => void

  /** Prompt the user before discarding recovered snapshots. Returns or resolves
   *  true to prune, false to keep them. Sync or async, mirroring the ADR-0104
   *  ProjectActionsContext.confirmDiscard seam. Discard never prunes when omitted. */
  confirmDiscard?: () => boolean | Promise<boolean>
}

export function useRecentProjectsAndRecovery(context: RecentAndRecoveryContext): {
  recentEntries: RecentEntry[]
  recovery: Recovery | null
} {
  const { recentProjects, snapshots, onSession, confirmDiscard } = context
  const [recentEntries, setRecentEntries] = useState<RecentEntry[]>([])
  const [recovery, setRecovery] = useState<Recovery | null>(null)

  useEffect(() => {
    let cancelled = false
    const isLive = () => !cancelled

    void recentProjects.list().then((entries) => {
      if (isLive()) {
        setRecentEntries(
          orderRecentProjects(entries).map(({ id, name, backend }) => ({ id, name, backend })),
        )
      }
    })

    if (snapshots) {
      void snapshots.isRecoverable().then((recoverable) => {
        if (isLive() && recoverable) {
          setRecovery(buildRecovery({ snapshots, onSession, setRecovery, isLive, confirmDiscard }))
        }
      })
    }

    return () => {
      cancelled = true
    }
  }, [recentProjects, snapshots, onSession, confirmDiscard])

  return { recentEntries, recovery }
}

interface RecoveryHandlersContext {
  snapshots: SnapshotsPort
  onSession: (session: EditorSession) => void
  setRecovery: (recovery: Recovery | null) => void
  isLive: () => boolean
  confirmDiscard: (() => boolean | Promise<boolean>) | undefined
}

// Builds the restore/discard handlers, each guarded so they never touch React state
// after the owning effect has been torn down.
function buildRecovery(context: RecoveryHandlersContext): Recovery {
  const { snapshots, onSession, setRecovery, isLive, confirmDiscard } = context
  return {
    onRestore: () => {
      void snapshots.restore().then((project) => {
        if (!isLive()) {
          return
        }
        if (project) {
          onSession(createEditorSession(project))
        }
        setRecovery(null)
      })
    },
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
        // retry the discard. Mirrors the 'reopen folder failed' pattern above.
        .catch((error: unknown) => console.error('discard snapshots failed', error)),
  }
}
