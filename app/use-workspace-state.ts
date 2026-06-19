import { useMemo } from 'react'
import { createActiveFloorStore, createSelectionStore, useAutosave, useDirtyTracker } from '../bridge'
import type { EditorWorkspaceProps } from './app'
import { createAssetLibrary } from './create-asset-library-registry'
import { useBeforeUnloadGuard } from './use-before-unload-guard'
import { useDiscardConfirmation } from './use-discard-confirmation'
import { useProjectActions, useRecentProjectsAndRecovery } from './use-project-actions'

// The per-render state EditorWorkspace renders from: the context stores, the asset
// library, autosave/recent/recovery status, the file-menu actions, and the discard
// dialog's request plus its resolver. Lifted out of the component so the component
// reads as the provider tree it renders rather than the hook wiring behind it.
export interface WorkspaceState {
  selection: ReturnType<typeof createSelectionStore>
  activeFloorStore: ReturnType<typeof createActiveFloorStore>
  assetLibrary: ReturnType<typeof createAssetLibrary>
  saveStatus: ReturnType<typeof useAutosave>
  recentEntries: ReturnType<typeof useRecentProjectsAndRecovery>['recentEntries']
  recovery: ReturnType<typeof useRecentProjectsAndRecovery>['recovery']
  actions: ReturnType<typeof useProjectActions>
  discardRequest: ReturnType<typeof useDiscardConfirmation>['discardRequest']
  resolveDiscard: ReturnType<typeof useDiscardConfirmation>['resolveDiscard']
}

export function useWorkspaceState(props: EditorWorkspaceProps): WorkspaceState {
  const { session, store, assets, projectId, recentProjects, snapshots, onSession } = props
  const selection = useMemo(() => createSelectionStore(), [])
  const activeFloorStore = useMemo(
    () => createActiveFloorStore(session.getProject().floors[0]?.id ?? null),
    [session],
  )
  const { isDirty, markSaved } = useDirtyTracker(session)
  // Arm the browser-native leave warning while the workspace has unsaved changes.
  useBeforeUnloadGuard(isDirty)
  const { discardRequest, confirmDiscard, resolveDiscard } = useDiscardConfirmation()
  // Spread snapshots only when present: under exactOptionalPropertyTypes the optional
  // option rejects an explicit undefined.
  const saveStatus = useAutosave({ session, store, projectId, ...(snapshots ? { snapshots } : {}) })
  const { recentEntries, recovery } = useRecentProjectsAndRecovery({
    recentProjects,
    snapshots,
    onSession,
  })
  const actions = useProjectActions({ ...props, recentEntries, isDirty, confirmDiscard, markSaved })
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
