import { createEditorSession, type EditorSession } from '../../../bridge'
import { createReferenceProject } from '../reference-project'

/**
 * The editor session of a new reference project. This is the only file of the timing command
 * that imports `createEditorSession`, so a move of that factory changes one line here.
 */
export function createReferenceSession(): EditorSession {
  return createEditorSession(createReferenceProject())
}
