import { InMemoryProjectIndex } from './in-memory-project-index'
import type { ProjectIndex, ProjectRecord } from './project-index'

/**
 * How long a read of the first index may stay without an answer before it counts as failed. The
 * number is large on purpose: a switch by mistake on a slow machine costs the tab its list and its
 * times of use, and an index that never answers is rare.
 */
export const INDEX_READ_WAIT_MS = 10_000

/**
 * How long a write to the first index may stay without an answer before it rejects to its caller.
 * A write rejects in place of switching to memory: a full disk must not empty the list of the tab,
 * and the caller guards its own writes. Without a limit, one write that never settles would hold
 * every caller that waits for it.
 */
export const INDEX_WRITE_WAIT_MS = INDEX_READ_WAIT_MS

const MILLISECONDS_PER_SECOND = 1_000

const READ_WAIT_SECONDS = INDEX_READ_WAIT_MS / MILLISECONDS_PER_SECOND

const READ_TIMEOUT_MESSAGE = `The project index gave no answer within ${READ_WAIT_SECONDS} seconds.`

const WRITE_WAIT_SECONDS = INDEX_WRITE_WAIT_MS / MILLISECONDS_PER_SECOND

const WRITE_TIMEOUT_MESSAGE =
  'The project index gave no answer to a write ' + `within ${WRITE_WAIT_SECONDS} seconds.`

const READ_FAILED_WARNING =
  'The project index could not be read. This tab keeps its project records in memory.'

/**
 * What a read of the first index came to. `afterSwitch` is an answer of the first index that came
 * after this object switched to memory, so the read is answered from memory.
 */
type FirstOutcome<T> =
  | { readonly kind: 'answer'; readonly value: T }
  | { readonly kind: 'failure'; readonly error: unknown }
  | { readonly kind: 'afterSwitch' }

/**
 * An index over `first` that answers from memory, for the life of this object, once a read of
 * `first` rejects or gives no answer in time. A failed write does not switch: one full disk must
 * not empty the list.
 */
export function withMemoryFallback(first: ProjectIndex): ProjectIndex {
  return new MemoryFallbackIndex(first)
}

/**
 * True when `index` is a fall-back that switched to memory, so a write called now goes to memory.
 * False for every other index, which has no memory to switch to. Calls no method of the index.
 */
export function hasSwitchedToMemory(index: ProjectIndex): boolean {
  return index instanceof MemoryFallbackIndex && index.hasSwitched
}

class MemoryFallbackIndex implements ProjectIndex {
  private readonly memory = new InMemoryProjectIndex()
  private switched = false

  constructor(private readonly first: ProjectIndex) {}

  /** The same value that routes a write. */
  get hasSwitched(): boolean {
    return this.switched
  }

  all(): Promise<ProjectRecord[]> {
    return this.read((index) => index.all())
  }

  get(id: string): Promise<ProjectRecord | undefined> {
    return this.read((index) => index.get(id))
  }

  put(record: ProjectRecord): Promise<void> {
    return this.write((index) => index.put(record))
  }

  remove(id: string): Promise<void> {
    return this.write((index) => index.remove(id))
  }

  // After the switch a write goes to memory, which needs no time limit and no timer.
  private write(send: (index: ProjectIndex) => Promise<void>): Promise<void> {
    return this.switched ? send(this.memory) : this.sendToFirst(send)
  }

  // The first settlement wins and the others are ignored, so each write has its own time limit and
  // a late answer or rejection changes nothing for the caller. Both handlers are always attached,
  // so a rejection that comes after the time limit is handled too. A synchronous throw of `first`
  // reaches the caller as a rejection. A write that fails or times out switches nothing.
  private sendToFirst(send: (index: ProjectIndex) => Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(WRITE_TIMEOUT_MESSAGE))
      }, INDEX_WRITE_WAIT_MS)
      const stopTimer = (): void => clearTimeout(timer)
      try {
        send(this.first).then(
          () => {
            stopTimer()
            resolve()
          },
          (error: unknown) => {
            stopTimer()
            reject(error)
          },
        )
      } catch (error) {
        stopTimer()
        reject(error)
      }
    })
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
  // late answer or rejection changes nothing. Both handlers are always attached, so a rejection
  // that comes after the time limit is handled too.
  private askFirst<T>(ask: (index: ProjectIndex) => Promise<T>): Promise<FirstOutcome<T>> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve({ kind: 'failure', error: new Error(READ_TIMEOUT_MESSAGE) })
      }, INDEX_READ_WAIT_MS)
      const settle = (outcome: FirstOutcome<T>): void => {
        clearTimeout(timer)
        resolve(outcome)
      }
      try {
        ask(this.first).then(
          (value) => settle(this.switched ? { kind: 'afterSwitch' } : { kind: 'answer', value }),
          (error: unknown) => settle({ kind: 'failure', error }),
        )
      } catch (error) {
        settle({ kind: 'failure', error })
      }
    })
  }

  // A second failed read, such as one that was already in flight, switches nothing and warns
  // nothing. A warn that throws must not turn the answer from memory into a rejection.
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
