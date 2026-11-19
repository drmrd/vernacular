// The testing entry of the session layer: in-memory doubles, the session constructor, and the
// helpers of the handle and save gate kits, for tests and stories. Production code does not
// import it.
export { InMemoryProjectStore, InMemoryAssetCache } from '../../storage'
export { createEditorSession } from '../editor-session/editor-session'
export type { TestPorts } from '../handle/handle-test-kit'
export {
  createTestPorts,
  openOrThrow,
  failureOf,
  placeDocument,
  rememberFolder,
  workspaceRequest,
  storedProject,
  follow,
  createControlledLocks,
  IN_WORKSPACE,
  IN_FOLDER,
  DOCUMENT_FILE,
} from '../handle/handle-test-kit'
export { gateSaves, settle } from '../autosave/save-gate-test-kit'
export { InMemorySettingsPort } from '../../storage'
