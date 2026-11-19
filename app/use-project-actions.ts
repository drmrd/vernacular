import { useCallback } from 'react'
import { createNewProject, openFolder, openRecent, type DocumentHandle } from '../session'
import type { ProjectBackend, RecentProjectStore, StorageCapabilities } from '../storage'
import { type NotificationApi } from '../editor/design-system'
import { createInitialProject } from './create-initial-project'
import { recentInputOf, recordProject, useSwitchFlow } from './project-action-helpers'
import {
  useExportBundleAction,
  useExportImageAction,
  useExportPdfAction,
  useExportPlanAction,
} from './use-export-actions'
import { useOpenFileAction } from './use-open-file-action'
import type { RunFlow } from './use-open-project'

export interface RecentEntry {
  id: string
  name: string
  backend: ProjectBackend
}

export interface ProjectActionsContext {
  /** The open project of the latest render. */
  handle: DocumentHandle
  /** Runs a flow through the one owner of the open project. */
  runFlow: RunFlow
  recentProjects: RecentProjectStore
  capabilities: StorageCapabilities
  notifications: NotificationApi
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

// Save stores the open project now. A failed save shows itself through the save status, which
// raises the one toast of the shell, so this action raises none. A stored project is recorded in
// the recent list.
function useSaveAction(context: ProjectActionsContext): () => void {
  const { handle, recentProjects, capabilities } = context
  return useCallback(() => {
    void handle.save().then((outcome) => {
      if (outcome.ok) {
        recordProject(recentProjects, recentInputOf(handle, capabilities))
      }
    })
  }, [handle, recentProjects, capabilities])
}

// New project asks nothing: the switch stores an unsaved change of the open project first.
function useNewProjectAction(context: ProjectActionsContext): () => Promise<void> {
  const runSwitch = useSwitchFlow(context)
  return useCallback(
    () => runSwitch((ports, current) => createNewProject(ports, current, createInitialProject)),
    [runSwitch],
  )
}

// Open folder is gated on the native picker capability; without it the shell
// renders no control, so the handler is omitted rather than rendered inert.
function useOpenFolderAction(context: ProjectActionsContext): { onOpenFolder?: () => void } {
  const runSwitch = useSwitchFlow(context)
  const onOpenFolder = useCallback(() => {
    const attempt = (): void => {
      void runSwitch((ports, current) => openFolder(ports, current), { onRetry: attempt })
    }
    attempt()
  }, [runSwitch])
  return context.capabilities.fileSystemAccess ? { onOpenFolder } : {}
}

// The flow finds where the project is kept: a remembered folder, or the workspace.
function useOpenRecentAction(context: ProjectActionsContext): (id: string) => void {
  const runSwitch = useSwitchFlow(context)
  return useCallback(
    (id: string) => {
      const attempt = (): void => {
        void runSwitch((ports, current) => openRecent(ports, current, id), { onRetry: attempt })
      }
      attempt()
    },
    [runSwitch],
  )
}
