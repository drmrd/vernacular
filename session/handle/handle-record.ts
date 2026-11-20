import type { DecodeFailure } from '../../core'
import type { ProjectRecord, SaveReport } from '../../storage'
import type { EditorSession } from '../editor-session/editor-session'
import type { SessionPorts } from '../ports'
import { factsOf } from '../projects/project-facts'
import type { OpenRequest } from './handle-types'
import type { OpenedProject } from './read-for-open'

/** The longest time that a close, a hand-over, or a failed open waits for a record write. */
export const RECORD_WAIT_MS = 2000

/** The ports that a record write needs. */
export type RecordPorts = Pick<SessionPorts, 'index' | 'build' | 'now'>

/**
 * A session at the moment of a record request. The session's project is live, so the record is
 * made from it only while `unchanged` holds: then it is still the state that the store holds.
 */
export interface SessionMark {
  readonly session: EditorSession
  /** True while the session has made no change since the mark was taken. */
  readonly unchanged: () => boolean
}

/** Writes the record of one project into the index, one write at a time. */
export interface RecordKeeper {
  /** A read found the stored project. Writes its record with a new time of use. */
  opened(mark: SessionMark, opened: OpenedProject, lastChangedAt: string | undefined): void
  /** A write stored the project of the marked session. Writes its record with a new time of use. */
  saved(mark: SessionMark, report: SaveReport): void
  /**
   * Resolves when no record write of this keeper runs or waits, or after `RECORD_WAIT_MS`, with a
   * warning, when the index has not answered by then. Never rejects.
   */
  settled(): Promise<void>
}

/**
 * Makes the record when its write starts, so a record that is never written is never made. Gives
 * undefined when the session changed since the request, and rejects only when a read of the index
 * rejects.
 */
type MakeRecord = () => Promise<ProjectRecord | undefined>

/** Gives a warning to the console. */
type Warn = (message: string, error?: unknown) => void

/** The queue of the record writes of one handle. */
interface RecordQueue {
  ask(make: MakeRecord): void
  /** The run of the writes that run or wait; undefined when none does. Never rejects. */
  running(): Promise<void> | undefined
}

/** What a record holds besides the request and the facts of its project. */
interface RecordMoment {
  /** The session whose project the record describes, as it was at the request. */
  readonly mark: SessionMark
  /** False when the stored document did not pass the check. */
  readonly passedCheck: boolean
  readonly lastChangedAt: string | undefined
  readonly lastUsedAt: string
}

const READ_WARNING = 'The project index could not read the record of a project.'
const WRITE_WARNING = 'The project index did not write the record of a project.'
const WAIT_WARNING =
  'The project index did not answer in time, so the project went on without waiting for its record.'

/** The count of the changes of each session that a record was asked for. */
const changeCounts = new WeakMap<EditorSession, { value: number }>()

/** The count of the changes of the session since its first record request. */
function changeCountOf(session: EditorSession): { value: number } {
  const known = changeCounts.get(session)
  if (known !== undefined) {
    return known
  }
  const count = { value: 0 }
  session.subscribe(() => {
    count.value += 1
  })
  changeCounts.set(session, count)
  return count
}

/** Marks the session as it is now, so that a later record can tell whether it changed. */
export function markSession(session: EditorSession): SessionMark {
  const count = changeCountOf(session)
  const markedAt = count.value
  return { session, unchanged: () => count.value === markedAt }
}

/**
 * The whole record of the request's project at the moment, as opened by this build; undefined when
 * the session changed since the request, because its project is then not the stored one.
 */
function recordIfUnchanged(
  ports: RecordPorts,
  request: OpenRequest,
  moment: RecordMoment,
): ProjectRecord | undefined {
  if (!moment.mark.unchanged()) {
    return undefined
  }
  const facts = factsOf(moment.mark.session.getProject())
  return {
    id: request.id,
    location: request.location,
    name: facts.name,
    floorCount: facts.floorCount,
    preview: facts.preview,
    assetHashes: facts.assetHashes,
    assetListComplete: facts.assetsListed && moment.passedCheck,
    lastChangedAt: moment.lastChangedAt,
    lastUsedAt: moment.lastUsedAt,
    lastOpen: { opened: true, build: ports.build },
  }
}

/** Gives the warning to console.warn. A console that throws changes nothing. */
function warnSafely(message: string, error?: unknown): void {
  try {
    console.warn(message, error)
  } catch {
    // A console that throws has nowhere left to report to.
  }
}

/** Gives the first warning to the console and is silent for every later one. */
function createWarnOnce(): Warn {
  let warned = false
  return (message, error) => {
    if (!warned) {
      warned = true
      warnSafely(message, error)
    }
  }
}

/** Makes the record and writes it. A record that could not be made or written gives a warning. */
async function writeOne(ports: RecordPorts, make: MakeRecord, warn: Warn): Promise<void> {
  let record: ProjectRecord | undefined
  try {
    record = await make()
  } catch (error) {
    warn(READ_WARNING, error)
    return
  }
  if (record === undefined) {
    return
  }
  try {
    await ports.index.put(record)
  } catch (error) {
    warn(WRITE_WARNING, error)
  }
}

/**
 * The record writes of one handle: one runs at a time, in the order asked, and while one runs only
 * the latest request waits.
 */
function createRecordQueue(ports: RecordPorts, warn: Warn): RecordQueue {
  let running: Promise<void> | undefined
  let waiting: MakeRecord | undefined

  const drain = async (first: MakeRecord): Promise<void> => {
    try {
      let next: MakeRecord | undefined = first
      while (next !== undefined) {
        await writeOne(ports, next, warn)
        next = waiting
        waiting = undefined
      }
    } finally {
      running = undefined
    }
  }

  return {
    ask(make) {
      if (running === undefined) {
        running = drain(make)
      } else {
        waiting = make
      }
    },
    running: () => running,
  }
}

/**
 * True when the work settled within `RECORD_WAIT_MS`, false when the time ran out first. The timer
 * is cleared either way. Never rejects.
 */
async function settlesInTime(work: Promise<void>): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeUp = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), RECORD_WAIT_MS)
  })
  try {
    return await Promise.race([work.then(onSettled, onSettled), timeUp])
  } finally {
    clearTimeout(timer)
  }
}

/** A work that settled, whether it resolved or rejected, settled in time. */
function onSettled(): boolean {
  return true
}

/** The time of change of the record that the index holds for the id, if any. */
async function storedChangedAt(ports: RecordPorts, id: string): Promise<string | undefined> {
  const stored = await ports.index.get(id)
  return stored?.lastChangedAt
}

/** The record keeper of the handle that opened the request. It makes no index call until asked. */
export function createRecordKeeper(ports: RecordPorts, request: OpenRequest): RecordKeeper {
  const warn = createWarnOnce()
  const queue = createRecordQueue(ports, warn)
  const askAt = (make: (lastUsedAt: string) => Promise<ProjectRecord | undefined>): void => {
    try {
      const lastUsedAt = ports.now().toISOString()
      queue.ask(() => make(lastUsedAt))
    } catch (error) {
      warn(WRITE_WARNING, error)
    }
  }
  return {
    opened(mark, opened, lastChangedAt) {
      const passedCheck = !opened.openedDespiteFaults
      askAt(async (lastUsedAt) => {
        if (!mark.unchanged()) {
          return undefined
        }
        const changedAt = lastChangedAt ?? (await storedChangedAt(ports, request.id))
        const moment = { mark, passedCheck, lastChangedAt: changedAt, lastUsedAt }
        return recordIfUnchanged(ports, request, moment)
      })
    },
    saved(mark, report) {
      const passedCheck = report.faults.length === 0
      const { lastChangedAt } = report
      askAt(async (lastUsedAt) =>
        recordIfUnchanged(ports, request, { mark, passedCheck, lastChangedAt, lastUsedAt }),
      )
    },
    async settled() {
      const running = queue.running()
      if (running !== undefined && !(await settlesInTime(running))) {
        warn(WAIT_WARNING)
      }
    },
  }
}

/** Puts back the existing record of the id with the failure of its open. */
async function noteFailedOpen(
  ports: RecordPorts,
  failed: { readonly id: string; readonly decode: DecodeFailure },
  warn: Warn,
): Promise<void> {
  let before: ProjectRecord | undefined
  try {
    before = await ports.index.get(failed.id)
  } catch (error) {
    warn(READ_WARNING, error)
    return
  }
  if (before === undefined) {
    return
  }
  const lastOpen = { opened: false, build: ports.build, reason: failed.decode.kind }
  try {
    await ports.index.put({ ...before, lastOpen })
  } catch (error) {
    warn(WRITE_WARNING, error)
  }
}

/**
 * Notes in an existing record that the stored project did not open. Waits at most
 * `RECORD_WAIT_MS`, then gives up the wait with a warning; the write may still land. Never rejects.
 */
export async function recordFailedOpen(
  ports: RecordPorts,
  id: string,
  decode: DecodeFailure,
): Promise<void> {
  const warn = createWarnOnce()
  if (!(await settlesInTime(noteFailedOpen(ports, { id, decode }, warn)))) {
    warn(WAIT_WARNING)
  }
}
