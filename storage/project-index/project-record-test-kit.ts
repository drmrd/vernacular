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
  /** Lets the oldest held put of the record of `id` run, or makes it reject with `error`. */
  endOldestPutOf(id: string, error?: Error): void
  /** Lets every put that is held now run against the real index. Does nothing when none is held. */
  endAllPuts(): void
}

type HeldPut = (error?: Error) => void

/** A held put and the id of the record it writes. */
interface HeldPutOf {
  readonly id: string
  readonly end: HeldPut
}

/** Removes the first held put that `matches` from `held` and ends it; throws when none matches. */
function endFirstHeld(held: HeldPutOf[], matches: (put: HeldPutOf) => boolean, error?: Error) {
  const position = held.findIndex(matches)
  if (position < 0) throw new Error('No such put is held')
  const [put] = held.splice(position, 1)
  put?.end(error)
}

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
  const held: HeldPutOf[] = []
  index.put = (record) => {
    records.push(record)
    const put = heldPut(() => realPut(record))
    held.push({ id: record.id, end: put.end })
    return put.promise
  }
  return {
    started: () => records.length,
    startedRecords: () => [...records],
    endOldestPut: (error) => endFirstHeld(held, () => true, error),
    endOldestPutOf: (id, error) => endFirstHeld(held, (put) => put.id === id, error),
    endAllPuts: () => held.splice(0).forEach((put) => put.end()),
  }
}

export interface GetHold {
  /** How many gets have started since the hold was set. */
  started(): number
  /** Lets every held get run against the real index, and every later get run at once. */
  release(): void
}

/** From now on each `get` of `index` stays pending until the test releases the hold. */
export function holdGets(index: ProjectIndex): GetHold {
  const realGet = index.get.bind(index)
  let started = 0
  let release: () => void = () => undefined
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  index.get = async (id) => {
    started += 1
    await released
    return realGet(id)
  }
  return { started: () => started, release: () => release() }
}

/** The next `get` of `index` stays pending until the test releases it; later gets run at once. */
export function holdFirstGet(index: ProjectIndex): GetHold {
  const realGet = index.get.bind(index)
  let started = 0
  let release: () => void = () => undefined
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  index.get = async (id) => {
    started += 1
    if (started === 1) await released
    return realGet(id)
  }
  return { started: () => started, release: () => release() }
}

export interface PutHold {
  /** How many puts have started since the hold was set. */
  started(): number
  /** Lets the held put run against the real index. */
  release(): void
}

/** The next `put` of `index` stays pending until the test releases it; later puts run at once. */
export function holdFirstPut(index: ProjectIndex): PutHold {
  const realPut = index.put.bind(index)
  let started = 0
  let release: () => void = () => undefined
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  index.put = async (record) => {
    started += 1
    if (started === 1) await released
    return realPut(record)
  }
  return { started: () => started, release: () => release() }
}

/** From now on every call of `index` rejects with `error`, as the index of a refusing browser does. */
export function rejectEveryCall(index: ProjectIndex, error = new Error('the index refused')): void {
  const reject = (): Promise<never> => Promise.reject(error)
  index.all = reject
  index.get = reject
  index.put = reject
  index.remove = reject
}

/** The two methods of an index that only read. */
export type ReadMethod = 'all' | 'get'

export interface ReadHold {
  /** How many reads of the method have started since the hold was set. */
  started(): number
  /** Lets the oldest held read run against the real index and answer with what it gives. */
  answerOldest(): void
  /** Makes the oldest held read reject with `error`. */
  rejectOldest(error?: Error): void
}

interface HeldRead {
  readonly answer: () => void
  readonly reject: (error: Error) => void
}

/** From now on each `all` or `get` of `index`, as `method` says, stays pending until the test ends it. */
export function holdReads(index: ProjectIndex, method: ReadMethod): ReadHold {
  const held: HeldRead[] = []
  const realAll = index.all.bind(index)
  const realGet = index.get.bind(index)
  let started = 0
  const hold = <T>(run: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      started += 1
      held.push({ answer: () => run().then(resolve, reject), reject })
    })
  if (method === 'all') index.all = () => hold(realAll)
  else index.get = (id) => hold(() => realGet(id))
  const oldest = (): HeldRead => {
    const read = held.shift()
    if (read === undefined) throw new Error('No read is held')
    return read
  }
  return {
    started: () => started,
    answerOldest: () => oldest().answer(),
    rejectOldest: (error = new Error('the held read was rejected')) => oldest().reject(error),
  }
}

/** Where a promise stands: still pending, answered with a value, or rejected with an error. */
export type Watched =
  | { status: 'pending' }
  | { status: 'answered'; value: unknown }
  | { status: 'rejected'; error: unknown }

/** Follows `promise` without waiting for it, so that a test can look at it after moving the clock. */
export function watch(promise: Promise<unknown>): () => Watched {
  let state: Watched = { status: 'pending' }
  promise.then(
    (value) => {
      state = { status: 'answered', value }
    },
    (error: unknown) => {
      state = { status: 'rejected', error }
    },
  )
  return () => state
}
