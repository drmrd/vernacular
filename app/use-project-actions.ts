import { useCallback } from 'react'
import { createNewProject, openFolder, openRecent, type DocumentHandle } from '../session'
import type { StorageCapabilities } from '../storage'
import { type NotificationApi } from '../editor/design-system'
import { createInitialProject } from './create-initial-project'
import { useSwitchFlow, type RunSwitch } from './project-action-helpers'
import {
  useExportBundleAction,
  useExportImageAction,
  useExportPdfAction,
  useExportPlanAction,
} from './use-export-actions'
import type { LibraryLister } from './pack-supplies'
import { useOpenFileAction } from './use-open-file-action'
import type { RunFlow } from './use-open-project'

export interface ProjectActionsContext {
  /** The open project of the latest render. */
  handle: DocumentHandle
  /** Runs a flow through the one owner of the open project. */
  runFlow: RunFlow
  capabilities: StorageCapabilities
  notifications: NotificationApi
  /** The library whose packs supply assets by themselves, so that those assets do not count as missing. */
  packs?: LibraryLister
  /** Shows the Projects page over the open project. Without it the menu has no Switch projects. */
  showProjects?: () => void
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
  onImportFile?: () => void
  onSwitchProjects?: () => void
}

export function useProjectActions(context: ProjectActionsContext): ProjectActions {
  const runSwitch = useSwitchFlow(context.runFlow)
  return {
    onSave: useSaveAction(context),
    onOpenRecent: useOpenRecentAction(runSwitch),
    onNewProject: useNewProjectAction(runSwitch),
    onExportBundle: useExportBundleAction(context),
    onExportPlan: useExportPlanAction(context),
    onExportImage: useExportImageAction(context),
    onExportPdf: useExportPdfAction(context),
    ...useOpenFolderAction(context, runSwitch),
    ...useOpenFileAction(context),
    ...(context.showProjects === undefined ? {} : { onSwitchProjects: context.showProjects }),
  }
}

// Save stores the open project now. A failed save shows itself through the save status, which
// raises the one toast of the shell, so this action raises none.
function useSaveAction(context: ProjectActionsContext): () => void {
  const { handle } = context
  return useCallback(() => {
    void handle.save()
  }, [handle])
}

// New project asks nothing: the switch stores an unsaved change of the open project first.
function useNewProjectAction(runSwitch: RunSwitch): () => Promise<void> {
  return useCallback(
    () => runSwitch((ports, current) => createNewProject(ports, current, createInitialProject)),
    [runSwitch],
  )
}

// Open folder is gated on the native picker capability; without it the shell
// renders no control, so the handler is omitted rather than rendered inert.
function useOpenFolderAction(
  context: ProjectActionsContext,
  runSwitch: RunSwitch,
): { onOpenFolder?: () => void } {
  const onOpenFolder = useCallback(() => {
    const attempt = (): void => {
      void runSwitch((ports, current) => openFolder(ports, current), { onRetry: attempt })
    }
    attempt()
  }, [runSwitch])
  return context.capabilities.fileSystemAccess ? { onOpenFolder } : {}
}

// The flow finds where the project is kept: a remembered folder, or the workspace.
function useOpenRecentAction(runSwitch: RunSwitch): (id: string) => void {
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
