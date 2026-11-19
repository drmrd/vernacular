// The session layer holds application state and logic. It imports no React,
// no Three.js, and no browser global. See ADR-0175.
export type { EditorSession } from './editor-session/editor-session'
export { createEditorSession } from './editor-session/editor-session'
export { loadOrCreateProject } from './editor-session/load-or-create-project'
export type { GuardDestructiveOptions } from './editor-session/discard-guard'
export { guardDestructive, needsDiscardConfirmation } from './editor-session/discard-guard'
export type { DirtyTracker } from './editor-session/create-dirty-tracker'
export { createDirtyTracker } from './editor-session/create-dirty-tracker'
export type {
  AutosaveStatus,
  AutosaveOptions,
  AutosaveConfig,
  Autosave,
  SnapshotWriter,
  SnapshotPruner,
  CommitProjectOptions,
} from './autosave/create-autosave'
export {
  createAutosave,
  commitProject,
  DEFAULT_AUTOSAVE_DELAY_MS,
} from './autosave/create-autosave'
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
export type {
  AssetCache,
  ProjectLocation,
  ProjectStore,
  ProjectSummary,
  ProjectSnapshots,
} from '../storage'
