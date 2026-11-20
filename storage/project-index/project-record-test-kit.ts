import type { ProjectIndex, ProjectRecord } from './project-index'

/** Shared set-up of the tests that need a project record or an index that misbehaves. */

const SAMPLE_FLOOR_COUNT = 2
const HASH_BYTE_COUNT = 32
const SAMPLE_ASSET_HASH = 'ab'.repeat(HASH_BYTE_COUNT)

/**
 * A whole record of a workspace project, with the overrides applied. Each call builds new nested
 * objects and arrays, so a test can change one record without touching another.
 */
export function sampleRecord(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: 'house',
    location: { kind: 'workspace' },
    name: 'House',
    floorCount: SAMPLE_FLOOR_COUNT,
    preview: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    assetHashes: [SAMPLE_ASSET_HASH],
    assetListComplete: true,
    lastChangedAt: '2026-11-01T10:00:00.000Z',
    lastUsedAt: '2026-11-02T10:00:00.000Z',
    lastOpen: { opened: true, build: 'test-build' },
    ...overrides,
  }
}

/** An index whose every call rejects, and how many calls it got. */
export interface FailingIndex extends ProjectIndex {
  /** How many calls of `all`, `get`, `put`, and `remove` the index got. */
  calls(): number
}

/** A project index whose every call rejects with `error`, counting the calls. */
export function failingIndex(error: Error = new Error('the index is not available')): FailingIndex {
  let calls = 0
  const reject = (): Promise<never> => {
    calls += 1
    return Promise.reject(error)
  }
  return { all: reject, get: reject, put: reject, remove: reject, calls: () => calls }
}

export interface PutGate {
  /** How many puts have started since the gate was set. */
  started(): number
  /** The record of each put that started, in the order the puts started. */
  startedRecords(): ProjectRecord[]
  /** Lets the oldest held put run against the real index, or makes it reject with `error`. */
  endOldestPut(error?: Error): void
  /** Lets every put that is held now run against the real index. Does nothing when none is held. */
  endAllPuts(): void
}

type HeldPut = (error?: Error) => void

/** A put that waits until the test ends it, then runs `run` or rejects with the given error. */
function heldPut(run: () => Promise<void>): { promise: Promise<void>; end: HeldPut } {
  let end: HeldPut = () => undefined
  const promise = new Promise<void>((resolve, reject) => {
    end = (error) => {
      const outcome = error === undefined ? run() : Promise.reject(error)
      outcome.then(resolve, reject)
    }
  })
  return { promise, end }
}

/** From now on each `put` of `index` stays pending until the test ends it. */
export function gatePuts(index: ProjectIndex): PutGate {
  const realPut = index.put.bind(index)
  const records: ProjectRecord[] = []
  const held: HeldPut[] = []
  index.put = (record) => {
    records.push(record)
    const put = heldPut(() => realPut(record))
    held.push(put.end)
    return put.promise
  }
  const endOldestPut = (error?: Error): void => {
    const end = held.shift()
    if (end === undefined) throw new Error('No put is held')
    end(error)
  }
  return {
    started: () => records.length,
    startedRecords: () => [...records],
    endOldestPut,
    endAllPuts: () => held.splice(0).forEach((end) => end()),
  }
}
