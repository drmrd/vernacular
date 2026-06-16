import { useCallback, useEffect, useState } from 'react'
import { SvgPlanExporter } from '../core'
import { commitProject, createEditorSession, type EditorSession } from '../bridge'
import {
  DirectoryHandleStore,
  FileSystemFolderProjectStore,
  ZipBundleProjectStore,
  bundleFilename,
  downloadBytes,
  downloadText,
  orderRecentProjects,
  pngPlanFilename,
  pdfPlanFilename,
  rasterizeSvgToPng,
  recentEntryFor,
  svgPlanFilename,
  svgPlanToPdf,
  DEFAULT_RASTER_MAX_EDGE,
  PRINT_RASTER_MAX_EDGE,
  type ProjectBackend,
  type ProjectStore,
  type RecentProjectStore,
  type StorageCapabilities,
} from '../storage'
import { createInitialProject } from './create-initial-project'
import { useOpenFileAction, type ImportStatus } from './use-open-file-action'
import type { SnapshotsPort } from './app'

export type { ImportStatus }

export interface RecentEntry {
  id: string
  name: string
  backend: ProjectBackend
}

export interface Recovery {
  onRestore: () => void
  onDiscard: () => void
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
  projectId: string
  snapshots: SnapshotsPort | undefined
  recentProjects: RecentProjectStore
  capabilities: StorageCapabilities
  recentEntries: RecentEntry[]
  onSession: (session: EditorSession) => void
}

export interface ProjectActions {
  onSave: () => void
  onOpenRecent: (id: string) => void
  onNewProject: () => void
  onExportBundle: () => void
  onExportPlan: () => void
  onExportImage: () => void
  onExportPdf: () => void
  onOpenFolder?: () => void
  onImportDroppedFile?: (file: File) => void
  onOpenFile?: () => void
  importStatus?: ImportStatus | null
  dismissImportStatus?: () => void
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
  const { session, store, projectId, snapshots, recentProjects, capabilities } = context
  const backend = defaultStoreBackend(capabilities)
  return useCallback(() => {
    const project = session.getProject()
    void commitProject({
      store,
      projectId,
      project,
      ...(snapshots ? { snapshots } : {}),
    })
      .then(() => {
        if (backend !== null) {
          recordRecent(recentProjects, { id: projectId, name: project.meta.name, backend })
        }
      })
      // User-facing surfacing (a notification/toast) is deferred: no notification
      // system exists in this slice, so failures are logged for now.
      .catch((error: unknown) => console.error('save failed', error))
  }, [session, store, projectId, snapshots, recentProjects, backend])
}

function useExportBundleAction(context: ProjectActionsContext): () => void {
  const { session, projectId } = context
  return useCallback(() => {
    const project = session.getProject()
    const bundle = new ZipBundleProjectStore(projectId)
    void bundle
      .save(projectId, project)
      .then(() => bundle.exportBundle())
      .then((bytes) => downloadBytes(bytes, bundleFilename(project.meta.name)))
      .catch((error: unknown) => console.error('export bundle failed', error))
  }, [session, projectId])
}

function useExportPlanAction(context: ProjectActionsContext): () => void {
  const { session } = context
  return useCallback(() => {
    const project = session.getProject()
    const { content } = new SvgPlanExporter().export(project)
    downloadText(content, svgPlanFilename(project.meta.name), 'image/svg+xml')
  }, [session])
}

function useExportImageAction(context: ProjectActionsContext): () => void {
  const { session } = context
  return useCallback(() => {
    const project = session.getProject()
    const { content } = new SvgPlanExporter().export(project)
    void rasterizeSvgToPng(content, DEFAULT_RASTER_MAX_EDGE)
      .then((png) => downloadBytes(png, pngPlanFilename(project.meta.name)))
      .catch((error: unknown) => console.error('export PNG failed', error))
  }, [session])
}

function useExportPdfAction(context: ProjectActionsContext): () => void {
  const { session } = context
  return useCallback(() => {
    const project = session.getProject()
    const { content } = new SvgPlanExporter().export(project)
    void svgPlanToPdf(content, { units: project.meta.units, maxEdge: PRINT_RASTER_MAX_EDGE })
      .then((pdf) => downloadBytes(pdf, pdfPlanFilename(project.meta.name)))
      .catch((error: unknown) => console.error('export PDF failed', error))
  }, [session])
}

function useNewProjectAction(context: ProjectActionsContext): () => void {
  const { onSession } = context
  return useCallback(() => {
    onSession(createEditorSession(createInitialProject()))
  }, [onSession])
}

// Open folder is gated on the native picker capability; without it the shell
// renders no control, so the handler is omitted rather than rendered inert.
function useOpenFolderAction(context: ProjectActionsContext): { onOpenFolder?: () => void } {
  const { projectId, recentProjects, capabilities, onSession } = context
  const onOpenFolder = useCallback(() => {
    void FileSystemFolderProjectStore.open(projectId, new DirectoryHandleStore())
      .then(async (store) => {
        const project = await store.load(projectId)
        onSession(createEditorSession(project))
        recordRecent(recentProjects, {
          id: projectId,
          name: project.meta.name,
          backend: 'file-system-folder',
        })
      })
      .catch((error: unknown) => console.error('open folder failed', error))
  }, [projectId, recentProjects, onSession])
  return capabilities.fileSystemAccess ? { onOpenFolder } : {}
}

function useOpenRecentAction(context: ProjectActionsContext): (id: string) => void {
  const { store, projectId, recentEntries, onSession } = context
  return useCallback(
    (id: string) => {
      const entry = recentEntries.find((candidate) => candidate.id === id)
      if (entry?.backend === 'file-system-folder') {
        openFolderRecent({ id, projectId, onSession, fallback: store })
        return
      }
      // OPFS, zip-bundle, or no recorded backend route through the default store
      // load; per-backend reopen for the others is deferred (plan Open questions).
      void store
        .load(id)
        .then((project) => onSession(createEditorSession(project)))
        .catch((error: unknown) => console.error('open recent failed', error))
    },
    [store, projectId, recentEntries, onSession],
  )
}

interface OpenFolderRecentContext {
  id: string
  projectId: string
  onSession: (session: EditorSession) => void
  fallback: ProjectStore
}

// Reopen a picked folder, re-requesting permission; falls back to the default
// store load when no stored handle exists or permission is denied (spec 5.7).
function openFolderRecent(context: OpenFolderRecentContext): void {
  const { id, projectId, onSession, fallback } = context
  void FileSystemFolderProjectStore.reopen(id, new DirectoryHandleStore())
    .then(async (reopenedStore) => {
      if (reopenedStore === undefined) {
        const project = await fallback.load(id)
        onSession(createEditorSession(project))
        return
      }
      const project = await reopenedStore.load(projectId)
      onSession(createEditorSession(project))
    })
    .catch((error: unknown) => console.error('reopen folder failed', error))
}

export interface RecentAndRecoveryContext {
  recentProjects: RecentProjectStore
  snapshots: SnapshotsPort | undefined
  onSession: (session: EditorSession) => void
}

export function useRecentProjectsAndRecovery(context: RecentAndRecoveryContext): {
  recentEntries: RecentEntry[]
  recovery: Recovery | null
} {
  const { recentProjects, snapshots, onSession } = context
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
          setRecovery(buildRecovery({ snapshots, onSession, setRecovery, isLive }))
        }
      })
    }

    return () => {
      cancelled = true
    }
  }, [recentProjects, snapshots, onSession])

  return { recentEntries, recovery }
}

interface RecoveryHandlersContext {
  snapshots: SnapshotsPort
  onSession: (session: EditorSession) => void
  setRecovery: (recovery: Recovery | null) => void
  isLive: () => boolean
}

// Builds the restore/discard handlers, each guarded so they never touch React state
// after the owning effect has been torn down.
function buildRecovery(context: RecoveryHandlersContext): Recovery {
  const { snapshots, onSession, setRecovery, isLive } = context
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
    onDiscard: () => {
      void snapshots.prune().then(() => {
        if (isLive()) {
          setRecovery(null)
        }
      })
    },
  }
}
