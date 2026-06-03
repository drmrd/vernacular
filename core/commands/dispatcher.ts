import { captureInverse } from './inverse-capture'
import type { CapturedInverse } from './inverse-capture'
import type { CommandRegistry } from './command-registry'
import type { Command } from './command'

export interface DispatcherOptions {
  maxHistory?: number
}

// History is persisted with the project and bounded so autosave snapshots stay
// small; design spec 7.1 caps it at roughly the 200 most recent commands.
export const DEFAULT_MAX_HISTORY = 200

interface HistoryEntry {
  command: Command
  inverse: CapturedInverse
}

export class Dispatcher<S extends object> {
  private readonly maxHistory: number
  private readonly undoStack: HistoryEntry[] = []
  private readonly redoStack: Command[] = []

  constructor(
    private readonly state: S,
    private readonly registry: CommandRegistry<S>,
    options: DispatcherOptions = {},
  ) {
    this.maxHistory = options.maxHistory ?? DEFAULT_MAX_HISTORY
  }

  dispatch(command: Command): void {
    const inverse = this.run(command)
    // Linear history: committing a new edit abandons any redo branch.
    this.redoStack.length = 0
    this.record({ command, inverse })
  }

  undo(): boolean {
    const entry = this.undoStack.pop()
    if (entry === undefined) {
      return false
    }
    entry.inverse.revert()
    this.redoStack.push(entry.command)
    return true
  }

  redo(): boolean {
    const command = this.redoStack.pop()
    if (command === undefined) {
      return false
    }
    // Re-running captures a fresh inverse for the replayed mutation.
    const inverse = this.run(command)
    this.undoStack.push({ command, inverse })
    return true
  }

  canUndo(): boolean {
    return this.undoStack.length > 0
  }

  canRedo(): boolean {
    return this.redoStack.length > 0
  }

  private record(entry: HistoryEntry): void {
    // A coalescing gesture replaces the top entry with the merged command and a
    // combined inverse that reverts the newer effect before the older one, so a
    // single undo unwinds the whole gesture.
    const previous = this.undoStack.at(-1)
    const merged = previous ? entry.command.coalesceWith?.(previous.command) : undefined
    if (previous && merged) {
      this.undoStack[this.undoStack.length - 1] = {
        command: merged,
        inverse: combineInverses(entry.inverse, previous.inverse),
      }
      return
    }
    this.undoStack.push(entry)
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift()
    }
  }

  private run(command: Command): CapturedInverse {
    const handler = this.registry.handlerFor(command.type)
    if (handler === undefined) {
      throw new Error(`No handler registered for command "${command.type}"`)
    }
    const { state, inverse } = captureInverse(this.state)
    try {
      handler.apply(state, command.params)
    } catch (cause) {
      // Atomic on error: replay the inverse so a failed command leaves no trace.
      inverse.revert()
      throw new Error(`Command "${command.type}" failed and was rolled back`, {
        cause,
      })
    }
    return inverse
  }
}

function combineInverses(first: CapturedInverse, second: CapturedInverse): CapturedInverse {
  return {
    revert() {
      first.revert()
      second.revert()
    },
  }
}
