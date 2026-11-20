import { InMemoryProjectIndex } from './in-memory-project-index'
import type { ProjectIndex, ProjectRecord } from './project-index'

const READ_FAILED_WARNING =
  'The project index could not be read. This tab keeps its project records in memory.'

/**
 * An index over `first` that answers from memory, for the life of this object, once a read of
 * `first` rejects. A failed write does not switch: one full disk must not empty the list.
 */
export function withMemoryFallback(first: ProjectIndex): ProjectIndex {
  return new MemoryFallbackIndex(first)
}

class MemoryFallbackIndex implements ProjectIndex {
  private readonly memory = new InMemoryProjectIndex()
  private switched = false

  constructor(private readonly first: ProjectIndex) {}

  all(): Promise<ProjectRecord[]> {
    return this.read((index) => index.all())
  }

  get(id: string): Promise<ProjectRecord | undefined> {
    return this.read((index) => index.get(id))
  }

  // Async so that a synchronous throw of `first` reaches the caller as a rejection.
  async put(record: ProjectRecord): Promise<void> {
    return this.current().put(record)
  }

  async remove(id: string): Promise<void> {
    return this.current().remove(id)
  }

  private current(): ProjectIndex {
    return this.switched ? this.memory : this.first
  }

  private async read<T>(ask: (index: ProjectIndex) => Promise<T>): Promise<T> {
    if (!this.switched) {
      try {
        return await ask(this.first)
      } catch (error) {
        this.switchToMemory(error)
      }
    }
    return ask(this.memory)
  }

  // A second failed read, such as one that was already in flight, switches nothing and warns nothing.
  private switchToMemory(error: unknown): void {
    if (this.switched) return
    this.switched = true
    console.warn(READ_FAILED_WARNING, error)
  }
}
