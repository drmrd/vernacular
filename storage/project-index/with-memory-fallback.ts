import { InMemoryProjectIndex } from './in-memory-project-index'
import type { ProjectIndex, ProjectRecord } from './project-index'

/**
 * How long a read of the first index may stay without an answer before it counts as failed. The
 * number is large on purpose: a switch by mistake on a slow machine costs the tab its list and its
 * times of use, and an index that never answers is rare.
 */
export const INDEX_READ_WAIT_MS = 10_000

const READ_FAILED_WARNING =
  'The project index could not be read. This tab keeps its project records in memory.'

/** What a read of the first index came to. `stale` is an answer that came after the switch. */
type FirstOutcome<T> =
  | { readonly kind: 'answer'; readonly value: T }
  | { readonly kind: 'failure'; readonly error: unknown }
  | { readonly kind: 'stale' }

/**
 * An index over `first` that answers from memory, for the life of this object, once a read of
 * `first` rejects or gives no answer in time. A failed write does not switch: one full disk must
 * not empty the list.
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

  // Async so that a synchronous throw of `first`, in `put` and in `remove`, reaches the caller as a
  // rejection. A write has no time limit: a write that never settles stays pending and switches nothing.
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
      const outcome = await this.askFirst(ask)
      if (outcome.kind === 'answer') return outcome.value
      if (outcome.kind === 'failure') this.switchToMemory(outcome.error)
    }
    return ask(this.memory)
  }

  // The first settlement wins and the others are ignored, so each read has its own time limit and a
  // late answer or rejection changes nothing. Both handlers are always attached, so a rejection that
  // comes after the time limit is handled too.
  private askFirst<T>(ask: (index: ProjectIndex) => Promise<T>): Promise<FirstOutcome<T>> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve({ kind: 'failure', error: new Error(noAnswerMessage()) })
      }, INDEX_READ_WAIT_MS)
      const settle = (outcome: FirstOutcome<T>): void => {
        clearTimeout(timer)
        resolve(outcome)
      }
      try {
        ask(this.first).then(
          (value) => settle(this.switched ? { kind: 'stale' } : { kind: 'answer', value }),
          (error: unknown) => settle({ kind: 'failure', error }),
        )
      } catch (error) {
        settle({ kind: 'failure', error })
      }
    })
  }

  // A second failed read, such as one that was already in flight, switches nothing and warns nothing.
  // A warn that throws must not turn the answer from memory into a rejection.
  private switchToMemory(error: unknown): void {
    if (this.switched) return
    this.switched = true
    try {
      console.warn(READ_FAILED_WARNING, error)
    } catch {
      // The switch has happened; losing the warning is better than losing the answer.
    }
  }
}

function noAnswerMessage(): string {
  return `The project index gave no answer within ${INDEX_READ_WAIT_MS} ms.`
}
