import type { DecodeFailure, Project } from '../../core'
import type { ProjectRecord, SaveReport } from '../../storage'
import type { SessionPorts } from '../ports'
import { factsOf } from '../projects/project-facts'
import type { OpenRequest } from './handle-types'
import type { OpenedProject } from './read-for-open'

/** The ports that a record write needs. */
export type RecordPorts = Pick<SessionPorts, 'index' | 'build' | 'now'>

/** Writes the record of one project into the index, one write at a time. */
export interface RecordKeeper {
  /** A read found the stored project. Writes its record with a new time of use. */
  opened(opened: OpenedProject, lastChangedAt: string | undefined): void
  /** A write stored exactly this project. Writes its record with a new time of use. */
  saved(project: Project, report: SaveReport): void
  /** Resolves when no record write of this keeper runs or waits. Never rejects. */
  settled(): Promise<void>
}

/** Makes the record when its write starts, so a record that is never written is never made. */
type MakeRecord = () => Promise<ProjectRecord>

/** What a record holds besides the request and the facts of its project. */
interface RecordMoment {
  readonly project: Project
  /** False when the stored document did not pass the check. */
  readonly checked: boolean
  readonly lastChangedAt: string | undefined
  readonly lastUsedAt: string
}

const INDEX_WARNING = 'The project index did not take the record of a project.'

/** The whole record of the request's project at the moment, as opened by this build. */
function wholeRecord(
  ports: RecordPorts,
  request: OpenRequest,
  moment: RecordMoment,
): ProjectRecord {
  const facts = factsOf(moment.project)
  return {
    id: request.id,
    location: request.location,
    name: facts.name,
    floorCount: facts.floorCount,
    preview: facts.preview,
    assetHashes: facts.assetHashes,
    assetListComplete: facts.assetsListed && moment.checked,
    lastChangedAt: moment.lastChangedAt,
    lastUsedAt: moment.lastUsedAt,
    lastOpen: { opened: true, build: ports.build },
  }
}

/** Gives the first error to console.warn and is silent for every later one. */
function createWarnOnce(): (error: unknown) => void {
  let warned = false
  return (error) => {
    if (!warned) {
      warned = true
      console.warn(INDEX_WARNING, error)
    }
  }
}

/**
 * The record writes of one handle: one runs at a time, in the order asked, and while one runs only
 * the latest request waits. The first write that fails goes to console.warn; later ones are silent.
 */
function createRecordQueue(ports: RecordPorts): {
  ask(make: MakeRecord): void
  settled(): Promise<void>
  warn(error: unknown): void
} {
  let running: Promise<void> | undefined
  let waiting: MakeRecord | undefined
  const warn = createWarnOnce()

  const writeOne = async (make: MakeRecord): Promise<void> => {
    try {
      await ports.index.put(await make())
    } catch (error) {
      warn(error)
    }
  }
  const drain = async (first: MakeRecord): Promise<void> => {
    let next: MakeRecord | undefined = first
    while (next !== undefined) {
      await writeOne(next)
      next = waiting
      waiting = undefined
    }
    running = undefined
  }

  return {
    ask(make) {
      if (running === undefined) {
        running = drain(make)
      } else {
        waiting = make
      }
    },
    settled: () => running ?? Promise.resolve(),
    warn,
  }
}

/** The time of change of the record that the index holds for the id, if any. */
async function storedChangedAt(ports: RecordPorts, id: string): Promise<string | undefined> {
  const stored = await ports.index.get(id)
  return stored?.lastChangedAt
}

/** The record keeper of the handle that opened the request. It makes no index call until asked. */
export function createRecordKeeper(ports: RecordPorts, request: OpenRequest): RecordKeeper {
  const queue = createRecordQueue(ports)
  const askAt = (moment: (lastUsedAt: string) => Promise<RecordMoment>): void => {
    try {
      const lastUsedAt = ports.now().toISOString()
      queue.ask(async () => wholeRecord(ports, request, await moment(lastUsedAt)))
    } catch (error) {
      queue.warn(error)
    }
  }
  return {
    opened(opened, lastChangedAt) {
      askAt(async (lastUsedAt) => ({
        project: opened.project,
        checked: !opened.openedDespiteFaults,
        lastChangedAt: lastChangedAt ?? (await storedChangedAt(ports, request.id)),
        lastUsedAt,
      }))
    },
    saved(project, report) {
      askAt(async (lastUsedAt) => ({
        project,
        checked: report.faults.length === 0,
        lastChangedAt: report.lastChangedAt,
        lastUsedAt,
      }))
    },
    settled: () => queue.settled(),
  }
}

/** Notes in an existing record that the stored project did not open. Never rejects. */
export async function recordFailedOpen(
  ports: RecordPorts,
  id: string,
  decode: DecodeFailure,
): Promise<void> {
  try {
    const before = await ports.index.get(id)
    if (before === undefined) {
      return
    }
    await ports.index.put({
      ...before,
      lastOpen: { opened: false, build: ports.build, reason: decode.kind },
    })
  } catch (error) {
    console.warn(INDEX_WARNING, error)
  }
}
