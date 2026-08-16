import { useCallback, useMemo, useState } from 'react'
import {
  createActiveFloorStore,
  createSelectionStore,
  useAutosave,
  useDirtyTracker,
  type AutosaveStatus,
} from '../bridge'
import { useNotifications } from '../editor/design-system'
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
  saveStatus: AutosaveStatus
  recentEntries: ReturnType<typeof useRecentProjectsAndRecovery>['recentEntries']
  recovery: ReturnType<typeof useRecentProjectsAndRecovery>['recovery']
  actions: ReturnType<typeof useProjectActions>
  discardRequest: ReturnType<typeof useDiscardConfirmation>['discardRequest']
  resolveDiscard: ReturnType<typeof useDiscardConfirmation>['resolveDiscard']
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
