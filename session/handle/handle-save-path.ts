import type { ProjectLockHold } from '../../storage'
import type { Autosave } from '../autosave/create-autosave'
import { callGuardedAsync } from '../guarded-call'
import type { HandOver } from './handle-internals'
import type { RecordKeeper } from './handle-record'
import type { SaveOutcome } from './handle-types'
import { messageOf } from './thrown-failures'

const SAVED: SaveOutcome = { ok: true }

type SaveFailed = Extract<SaveOutcome, { readonly ok: false }>

/** The message of a save or a flush asked of a handle that has closed. */
const CLOSED_OUTCOME: SaveFailed = {
  ok: false,
  message: 'The project is closed, so nothing was saved.',
}

function failedWith(error: unknown): SaveOutcome {
  return { ok: false, message: messageOf(error) }
}

/** What a handle saves, flushes, and closes with. */
export interface SavePathParts {
  readonly autosave: Autosave
  readonly hold: ProjectLockHold
  readonly records: RecordKeeper
}

export interface SavePath {
  save(): Promise<SaveOutcome>
  flush(): Promise<SaveOutcome>
  close(): Promise<SaveOutcome>
  handOver(): Promise<HandOver>
}

/** Whether the handle is closed, and the close or the hand-over that runs. */
interface EndState {
  closed: boolean
  ending: Promise<SaveOutcome> | undefined
}

/** Starts the end of a handle, as a close or as a hand-over, and gives that attempt. */
type StartEnding = () => Promise<SaveOutcome>

function closeWith(state: EndState, startEnding: StartEnding): Promise<SaveOutcome> {
  if (state.ending !== undefined) {
    return state.ending
  }
  if (state.closed) {
    return Promise.resolve(SAVED)
  }
  return startEnding()
}

/**
 * Ends the handle as a close does and gives its lock to the caller. A call that overlaps a close or
 * another hand-over shares that attempt and gets no lock, so the lock has one owner at a time.
 */
async function handOverWith(
  state: EndState,
  startEnding: StartEnding,
  hold: ProjectLockHold,
): Promise<HandOver> {
  if (state.ending !== undefined) {
    const shared = await state.ending
    return shared.ok ? CLOSED_OUTCOME : shared
  }
  if (state.closed) {
    return CLOSED_OUTCOME
  }
  const outcome = await startEnding()
  return outcome.ok ? { ok: true, hold } : outcome
}

/** What a handle does with its lock at the end of a close and at the end of a hand-over. */
interface LockEnds {
  readonly releaseLock: () => Promise<void>
  readonly keepLock: () => Promise<void>
}

function lockEnds(hold: ProjectLockHold, records: RecordKeeper): LockEnds {
  // The keeper hears of it first: once another handle can take the lock, no record is built here.
  // A hand-over keeps the lock for the restored handle, which shares the keeper: it says nothing.
  return {
    releaseLock: () => {
      records.lockReleased()
      return callGuardedAsync(() => hold.release())
    },
    keepLock: () => Promise.resolve(),
  }
}

/**
 * The save, the flush, the close, and the hand-over of a handle. A close flushes again while
 * autosave has work left: a write is needed, or a write of the handle runs or waits, whoever asked
 * for it, so no store save runs after the lock is freed. Then it marks the handle closed and stops
 * autosave with no wait in between, then waits for the record writes of the handle, at most
 * `RECORD_WAIT_MS`, then tells the keeper and frees the lock. A hand-over does the same, except
 * that it keeps the lock for its caller and does not tell the keeper. A flush that fails leaves the
 * handle open, the lock held, and autosave armed. A close called while another close runs, also
 * while that close frees the lock, gets the same attempt, so the lock is freed once.
 */
export function createSavePath(parts: SavePathParts): SavePath {
  const { autosave, hold, records } = parts
  const state: EndState = { closed: false, ending: undefined }

  const save = (): Promise<SaveOutcome> =>
    state.closed ? Promise.resolve(CLOSED_OUTCOME) : autosave.save().then(() => SAVED, failedWith)
  const flush = (): Promise<SaveOutcome> =>
    state.closed ? Promise.resolve(CLOSED_OUTCOME) : autosave.flush().then(() => SAVED, failedWith)

  const endOnce = async (afterEnd: () => Promise<void>): Promise<SaveOutcome> => {
    let outcome = await flush()
    while (outcome.ok && autosave.hasWorkLeft()) {
      outcome = await flush()
    }
    if (!outcome.ok) {
      return outcome
    }
    state.closed = true
    autosave.dispose()
    await records.settled()
    await afterEnd()
    return SAVED
  }

  const startEnding = (afterEnd: () => Promise<void>): Promise<SaveOutcome> => {
    state.ending = endOnce(afterEnd).finally(() => {
      state.ending = undefined
    })
    return state.ending
  }
  const { releaseLock, keepLock } = lockEnds(hold, records)

  return {
    save,
    flush,
    close: () => closeWith(state, () => startEnding(releaseLock)),
    handOver: () => handOverWith(state, () => startEnding(keepLock), hold),
  }
}
