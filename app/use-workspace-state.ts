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
  props: EditorWorkspaceProps
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
  const {
    props: { session, store, projectId, snapshots },
    revision,
    markSavedRevision,
  } = options
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
  const { saveStatus, reportSaved } = useSaveStatus({ props, revision, markSavedRevision })
  const { recentEntries, recovery } = useRecentProjectsAndRecovery({
    recentProjects,
    snapshots,
    onSession,
    confirmDiscard,
  })
  const actions = useProjectActions({
    ...props,
    recentEntries,
    isDirty,
    confirmDiscard,
    revision,
    markSavedRevision,
    reportSaved,
    notifications: useNotifications(),
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
