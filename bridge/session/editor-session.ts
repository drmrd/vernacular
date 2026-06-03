import {
  CommandRegistry,
  Dispatcher,
  createSceneGraphDeriver,
  registerProjectCommands,
  registerWallCommands,
  type Command,
  type Project,
  type SceneGraph,
} from '../../core'

/**
 * The dispatch boundary: the only bridge-layer entry point through which the
 * model changes. Consumers dispatch commands; they do not mutate the project
 * directly. Subscribers are notified after each state-changing operation.
 */
export interface EditorSession {
  dispatch(command: Command): void
  undo(): boolean
  redo(): boolean
  /**
   * Returns the current project as a read-only view. The reference is live: it
   * reflects later mutations rather than being a point-in-time snapshot. Callers
   * must not mutate it; all changes flow through dispatch.
   */
  getProject(): Readonly<Project>
  /**
   * Returns the derived scene graph, memoized by an internal version so the
   * reference is stable between mutations. This makes it safe to use directly
   * as a `useSyncExternalStore` snapshot.
   */
  getSceneGraph(): SceneGraph
  /** Registers a change listener. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void
}

export function createEditorSession(project: Project): EditorSession {
  const registry = new CommandRegistry<Project>()
  registerProjectCommands(registry)
  registerWallCommands(registry)
  const dispatcher = new Dispatcher<Project>(project, registry)
  const derive = createSceneGraphDeriver()
  const listeners = new Set<() => void>()

  // Memoize the derived scene graph by a version counter so getSceneGraph returns
  // a referentially stable snapshot between mutations (required by useSyncExternalStore).
  let version = 0
  let snapshot = derive(project)
  let snapshotVersion = version

  const notify = (): void => {
    version += 1
    for (const listener of listeners) {
      listener()
    }
  }

  return {
    dispatch(command) {
      dispatcher.dispatch(command)
      notify()
    },
    undo() {
      const changed = dispatcher.undo()
      if (changed) {
        notify()
      }
      return changed
    },
    redo() {
      const changed = dispatcher.redo()
      if (changed) {
        notify()
      }
      return changed
    },
    getProject: () => project,
    getSceneGraph() {
      if (snapshotVersion !== version) {
        snapshot = derive(project)
        snapshotVersion = version
      }
      return snapshot
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
