/**
 * The queue of the record writes of one handle, the builder of the records, and the keeper that
 * ties them together. The session mark, the bounded wait with its warnings, and the note of a
 * failed open have their own modules.
 */
import type { ProjectRecord, SaveReport } from '../../storage'
import type { SessionPorts } from '../ports'
import { factsOf } from '../projects/project-facts'
import type { OpenRequest } from './handle-types'
import type { OpenedProject } from './read-for-open'
import {
  createWarnOnce,
  READ_WARNING,
  settlesInTime,
  WAIT_WARNING,
  WRITE_WARNING,
  type Warn,
} from './record-wait'
import type { SessionMark } from './session-mark'

export { RECORD_WAIT_MS } from './record-wait'

/** The ports that a record write needs. */
export type RecordPorts = Pick<SessionPorts, 'index' | 'build' | 'now'>

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

/** The time of change of the record that the index holds for the id, if any. */
async function storedChangedAt(ports: RecordPorts, id: string): Promise<string | undefined> {
  const stored = await ports.index.get(id)
  return stored?.lastChangedAt
}

/**
 * The record of an open: reads the time of change from the index when the read gave none, then
 * makes the record of the moment. Undefined when the session changed since the request, before or
 * during that read. Rejects only when the read of the index rejects.
 */
async function recordOfOpen(
  ports: RecordPorts,
  request: OpenRequest,
  moment: RecordMoment,
): Promise<ProjectRecord | undefined> {
  if (!moment.mark.unchanged()) {
    return undefined
  }
  const lastChangedAt = moment.lastChangedAt ?? (await storedChangedAt(ports, request.id))
  return recordIfUnchanged(ports, request, { ...moment, lastChangedAt })
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
      askAt((lastUsedAt) =>
        recordOfOpen(ports, request, { mark, passedCheck, lastChangedAt, lastUsedAt }),
      )
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
