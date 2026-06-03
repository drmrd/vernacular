import {
  CommandRegistry,
  Dispatcher,
  createSceneGraphDeriver,
  registerProjectCommands,
  type Command,
  type Project,
  type SceneGraph,
} from '../../core'

/** The dispatch boundary: the one place outside core/commands that mutates the model. */
export interface EditorSession {
  dispatch(command: Command): void
  undo(): boolean
  redo(): boolean
  getProject(): Project
  getSceneGraph(): SceneGraph
}

export function createEditorSession(project: Project): EditorSession {
  const registry = new CommandRegistry<Project>()
  registerProjectCommands(registry)
  const dispatcher = new Dispatcher<Project>(project, registry)
  const derive = createSceneGraphDeriver()
  return {
    dispatch: (command) => dispatcher.dispatch(command),
    undo: () => dispatcher.undo(),
    redo: () => dispatcher.redo(),
    getProject: () => project,
    getSceneGraph: () => derive(project),
  }
}
