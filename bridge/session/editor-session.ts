import {
  CommandRegistry,
  Dispatcher,
  createSceneGraphDeriver,
  registerProjectCommands,
  type Command,
  type Project,
  type SceneGraph,
} from '../../core'

/**
 * The dispatch boundary: the only bridge-layer entry point through which the
 * model changes. Consumers dispatch commands; they do not mutate the project
 * directly.
 */
export interface EditorSession {
  dispatch(command: Command): void
  undo(): boolean
  redo(): boolean
  getProject(): Readonly<Project>
  /**
   * Re-derives the scene graph on each call. The derivation is memoized by
   * floor object reference, so unchanged floors are reused across calls.
   */
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
