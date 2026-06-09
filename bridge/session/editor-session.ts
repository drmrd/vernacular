import {
  CommandRegistry,
  Dispatcher,
  createSceneGraphDeriver,
  registerDimensionCommands,
  registerOpeningCommands,
  registerProjectCommands,
  registerRoomCommands,
  registerUnderlayCommands,
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
  registerRoomCommands(registry)
  registerUnderlayCommands(registry)
  registerOpeningCommands(registry)
  registerDimensionCommands(registry)
  const dispatcher = new Dispatcher<Project>(project, registry)
  const notifier = createChangeNotifier()
  const sceneGraph = createMemoizedSceneGraph(project)

  const onChange = (): void => {
    sceneGraph.invalidate()
    notifier.notify()
  }

  return {
    dispatch(command) {
      dispatcher.dispatch(command)
      onChange()
    },
    undo() {
      const changed = dispatcher.undo()
      if (changed) {
        onChange()
      }
      return changed
    },
    redo() {
      const changed = dispatcher.redo()
      if (changed) {
        onChange()
      }
      return changed
    },
    getProject: () => project,
    getSceneGraph: sceneGraph.get,
    subscribe: notifier.subscribe,
  }
}

interface ChangeNotifier {
  subscribe(listener: () => void): () => void
  notify(): void
}

function createChangeNotifier(): ChangeNotifier {
  const listeners = new Set<() => void>()
  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    notify() {
      for (const listener of listeners) {
        listener()
      }
    },
  }
}

interface MemoizedSceneGraph {
  get(): SceneGraph
  invalidate(): void
}

/**
 * Memoizes the derived scene graph by a version counter so `get` returns a
 * referentially stable snapshot between mutations (required by
 * useSyncExternalStore). `invalidate` is called on each change event.
 */
function createMemoizedSceneGraph(project: Project): MemoizedSceneGraph {
  const derive = createSceneGraphDeriver()
  let version = 0
  let snapshot = derive(project)
  let snapshotVersion = version

  return {
    get() {
      if (snapshotVersion !== version) {
        snapshot = derive(project)
        snapshotVersion = version
      }
      return snapshot
    },
    invalidate() {
      version += 1
    },
  }
}
