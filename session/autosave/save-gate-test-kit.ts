import type { Project } from '../../core'
import type { DocumentStore, SaveReport } from '../../storage'

/** Test support: holds the saves of a store until the test lets each one go. */

/**
 * Enough turns of the microtask queue for every chained promise to settle. A save to an
 * in-memory store takes a handful; the queue and the handle add a few more on each write.
 */
const MICROTASK_TURNS = 100

export interface SaveGate {
  /** Lets the oldest held save run against the real store, or makes it reject with `error`. */
  endOldestSave(error?: Error): void
  /** How many saves have started. */
  started(): number
  /** The most saves that ran at the same time. */
  mostRunningTogether(): number
}

interface SaveCounts {
  started: number
  running: number
  mostRunningTogether: number
}

type RealSave = (id: string, project: Project) => Promise<SaveReport>

/** Runs the held save once the test ends it, and counts it as running until it settles. */
function heldSave(counts: SaveCounts, run: () => Promise<SaveReport>) {
  counts.started += 1
  counts.running += 1
  counts.mostRunningTogether = Math.max(counts.mostRunningTogether, counts.running)
  let end: (error?: Error) => void = () => undefined
  const promise = new Promise<SaveReport>((resolve, reject) => {
    end = (error) => {
      const outcome = error === undefined ? run() : Promise.reject(error)
      outcome
        .finally(() => {
          counts.running -= 1
        })
        .then(resolve, reject)
    }
  })
  return { promise, end }
}

/** From now on every `store.save` stays pending until the test ends it. */
export function gateSaves(store: DocumentStore): SaveGate {
  const realSave: RealSave = store.save.bind(store)
  const counts: SaveCounts = { started: 0, running: 0, mostRunningTogether: 0 }
  const held: Array<(error?: Error) => void> = []
  store.save = (id, project) => {
    const save = heldSave(counts, () => realSave(id, project))
    held.push(save.end)
    return save.promise
  }
  return {
    endOldestSave: (error) => {
      const end = held.shift()
      if (end === undefined) throw new Error('No save is held')
      end(error)
    },
    started: () => counts.started,
    mostRunningTogether: () => counts.mostRunningTogether,
  }
}

/** Enough turns of the microtask queue for every chained promise to settle. */
export async function settle(): Promise<void> {
  for (let turn = 0; turn < MICROTASK_TURNS; turn++) {
    await Promise.resolve()
  }
}
