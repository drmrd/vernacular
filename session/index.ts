// The session layer holds application state and logic. It imports no React,
// no Three.js, and no browser global. See ADR-0175.
export type { EditorSession } from './editor-session/editor-session'
export type { GuardDestructiveOptions } from './editor-session/discard-guard'
export { guardDestructive, needsDiscardConfirmation } from './editor-session/discard-guard'
export type { AutosaveStatus } from './autosave/create-autosave'
export { DEFAULT_AUTOSAVE_DELAY_MS } from './autosave/create-autosave'
export type { SettingKey, SettingsService } from './settings/settings-service'
export { createSettingsService } from './settings/settings-service'
export type { SessionPorts } from './ports'
export type {
  OpenFailure,
  SaveStatus,
  SaveOutcome,
  HandleNotice,
  DocumentHandle,
  OpenResult,
  OpenRequest,
} from './handle/handle-types'
export { openDocumentHandle } from './handle/open-document-handle'
export type { SwitchResult } from './flows/switch-project'
export { switchProject } from './flows/switch-project'
export type { SwitchFailure, FlowResult } from './flows/flow-result'
export type { ImportedFile, ImportFailure, ImportResult } from './flows/import-file'
export type { FolderRefusal } from './flows/open-folder'
export type { ExportArchiveOptions, ExportArchiveResult } from './flows/export-archive'
export type { RestoreRefusal } from './flows/restore-snapshot'
export { createNewProject } from './flows/create-new-project'
export { importFile } from './flows/import-file'
export { openFolder } from './flows/open-folder'
export { openRecent, requestFor } from './flows/open-recent'
export { newProjectRequest, startProject } from './flows/start'
export type { RenameFailure, RenameRequest, RenameResult } from './flows/rename-project'
export { renameProject } from './flows/rename-project'
export { exportArchive } from './flows/export-archive'
export type { ExportFailure, ExportProjectResult, ExportRequest } from './flows/export-project'
export { exportProject } from './flows/export-project'
export { restoreSnapshot } from './flows/restore-snapshot'
export type { DeleteFailure, DeleteRequest, DeleteResult } from './flows/delete-project'
export { deleteProject } from './flows/delete-project'
export type { RemoveFromListFailure, RemoveFromListResult } from './flows/remove-folder-from-list'
export { removeFolderFromList } from './flows/remove-folder-from-list'
export { assetsOf } from './handle/handle-assets'
export { isStored } from './handle/handle-stored'
export { reconcileIndex } from './projects/reconcile-index'
export { displayNameOf, UNNAMED_PROJECT } from './projects/display-name'
export { recentRecords } from './projects/recent-records'
export { listProjectCards } from './projects/project-cards'
export type {
  ProjectCardAction,
  ProjectCardLocation,
  ProjectCardModel,
  ProjectCardPreview,
  ProjectCardStateLine,
} from './projects/project-cards'
export type {
  AssetCache,
  ProjectIndex,
  ProjectLocation,
  ProjectRecord,
  ProjectSnapshots,
} from '../storage'
