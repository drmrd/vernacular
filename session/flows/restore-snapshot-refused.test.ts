import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PROJECT_ID,
  REFUSED_COPY_NAME,
  REFUSED_TEXT,
  THE_REFUSED_BACKUP,
  autosaveFolderOf,
  backupFolderOf,
  plantRefusedCopy,
  logSnapshotCalls,
  rejectSetAside,
  openProject,
  refusedBackupsIn,
  textOf,
} from '../handle/handle-refused-snapshots-test-kit'
import { DEFAULT_AUTOSAVE_DELAY_MS } from '../autosave/create-autosave'
import { settle } from '../autosave/save-gate-test-kit'
import { createTestPorts, placeDocument, rename, storedName } from '../handle/handle-test-kit'
import { currentBytes } from '../../tests/storage/conformance/conformance-documents'
import { openStored } from './restore-snapshot-test-kit'
import type { StoredAndOpen } from './restore-snapshot-test-kit'
import type { DocumentStore } from '../../storage'
import { restoreSnapshot } from './restore-snapshot'

interface Logged extends StoredAndOpen {
  readonly log: string[]
}

const EDITED_NAME = 'Edited before the restore'
const EDITED_AGAIN_NAME = 'Edited after the refused restore'
const EDITED_THIRD_NAME = 'Edited again before the save'
const DISK_FULL = 'the disk is full'
const AUTOSAVE_PATH = autosaveFolderOf(PROJECT_ID)
const BACKUP_PATH = backupFolderOf(PROJECT_ID)

const DID_NOT_RESTORE = {
  ok: false,
  failure: { kind: 'did-not-restore', decode: { kind: 'not-json', message: expect.any(String) } },
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

/**
 * A handle on the stored project `a`, with an edit that is saved, and then a recovery copy that is
 * not JSON. The copy comes after the open, so the open did not move it, and after the save, which
 * removes every snapshot, so it is the one that a restore finds.
 */
async function openedThenRefused(): Promise<StoredAndOpen> {
  return refusedAfter(await openStored())
}

/** As `openedThenRefused`, with the handle opened after `install` wrapped the snapshots of the store. */
async function openedLogging(install: (store: DocumentStore) => string[]): Promise<Logged> {
  const ports = createTestPorts()
  await placeDocument(ports, PROJECT_ID, currentBytes())
  const log = install(ports.workspace)
  const handle = await openProject(ports)
  return { ...(await refusedAfter({ ports, sessionPorts: ports, handle })), log }
}

async function refusedAfter(opened: StoredAndOpen): Promise<StoredAndOpen> {
  rename(opened.handle, EDITED_NAME)
  await opened.handle.save()
  await plantRefusedCopy(opened.ports.root, AUTOSAVE_PATH)
  return opened
}

describe('a restore of a recovery copy that cannot be read', () => {
  it('a restore of a copy that is not JSON gives did-not-restore and moves the copy to the backups', async () => {
    const { ports, handle } = await openedThenRefused()

    const result = await restoreSnapshot(handle)

    expect(result).toEqual(DID_NOT_RESTORE)
    expect(await refusedBackupsIn(ports.root, BACKUP_PATH)).toEqual(THE_REFUSED_BACKUP)
    expect(await ports.root.list(AUTOSAVE_PATH)).not.toContain(REFUSED_COPY_NAME)
  })

  it('the open project stays as it was, with its handle and its lock', async () => {
    const { ports, handle } = await openedThenRefused()

    const result = await restoreSnapshot(handle)
    const shown = {
      name: handle.session.getProject().meta.name,
      undoable: handle.session.canUndo(),
    }
    rename(handle, EDITED_AGAIN_NAME)
    const saved = await handle.save()

    expect(result).toEqual(DID_NOT_RESTORE)
    expect(await ports.locks.heldIds()).toEqual(new Set([PROJECT_ID]))
    expect(shown).toEqual({ name: EDITED_NAME, undoable: true })
    expect(saved).toEqual({ ok: true })
    expect(await storedName(ports.workspace, PROJECT_ID)).toBe(EDITED_AGAIN_NAME)
  })

  it('after the move, nothing is recoverable', async () => {
    const { ports, handle } = await openedThenRefused()
    const recoverableBefore = await handle.snapshots.isRecoverable()

    await restoreSnapshot(handle)

    expect(recoverableBefore).toBe(true)
    expect(await handle.snapshots.isRecoverable()).toBe(false)
    expect(await ports.workspace.snapshots(PROJECT_ID).isRecoverable()).toBe(false)
  })

  it('a restore whose move rejects still gives did-not-restore', async () => {
    const { ports, handle } = await openedThenRefused()
    const setAside = vi
      .spyOn(handle.snapshots, 'setAsideRefused')
      .mockRejectedValue(new Error(DISK_FULL))

    const result = await restoreSnapshot(handle)

    expect(setAside).toHaveBeenCalledTimes(1)
    expect(result).toEqual(DID_NOT_RESTORE)
    expect(await ports.locks.heldIds()).toEqual(new Set([PROJECT_ID]))
    expect(await ports.root.list(AUTOSAVE_PATH)).toContain(REFUSED_COPY_NAME)
  })
})

describe('the saves that follow a restore of a recovery copy that cannot be read', () => {
  it('a restore whose move rejects keeps the copy in the autosave folder through an autosave and a save', async () => {
    const { ports, handle, log } = await openedLogging((store) =>
      rejectSetAside(store, new Error(DISK_FULL)),
    )
    log.length = 0
    await restoreSnapshot(handle)
    const afterRestore = [...log]

    rename(handle, EDITED_AGAIN_NAME)
    await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_DELAY_MS)
    await settle()
    const afterAutosave = await ports.root.list(AUTOSAVE_PATH)
    rename(handle, EDITED_THIRD_NAME)
    const saved = await handle.save()

    expect(afterRestore).toEqual([])
    expect(afterAutosave).toEqual([REFUSED_COPY_NAME])
    expect(await ports.root.list(AUTOSAVE_PATH)).toEqual([REFUSED_COPY_NAME])
    expect(saved).toEqual({ ok: true })
    expect(await storedName(ports.workspace, PROJECT_ID)).toBe(EDITED_THIRD_NAME)
    expect(textOf(await ports.root.readFile(`${AUTOSAVE_PATH}/${REFUSED_COPY_NAME}`))).toBe(
      REFUSED_TEXT,
    )
  })

  it('a restore whose move succeeds leaves the backup in place after an edit and a save', async () => {
    const { ports, handle, log } = await openedLogging(logSnapshotCalls)
    await restoreSnapshot(handle)
    log.length = 0

    rename(handle, EDITED_AGAIN_NAME)
    await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_DELAY_MS)
    await settle()
    const afterAutosave = [...log]
    rename(handle, EDITED_THIRD_NAME)
    const saved = await handle.save()

    expect(afterAutosave).toEqual([`writeSnapshot:${PROJECT_ID}`, `prune:${PROJECT_ID}`])
    expect(saved).toEqual({ ok: true })
    expect(await refusedBackupsIn(ports.root, BACKUP_PATH)).toEqual(THE_REFUSED_BACKUP)
  })

  it('a write that started before a restore whose move rejects leaves the copy when it ends', async () => {
    let release = (): void => undefined
    let gate = Promise.resolve()
    const { ports, handle, log } = await openedLogging((store) =>
      logSnapshotCalls(store, undefined, () => gate),
    )
    gate = new Promise<void>((resolve) => {
      release = resolve
    })
    vi.spyOn(handle.snapshots, 'setAsideRefused').mockRejectedValue(new Error(DISK_FULL))
    log.length = 0
    let writeStarted: string[]
    let result: Awaited<ReturnType<typeof restoreSnapshot>>
    try {
      rename(handle, EDITED_AGAIN_NAME)
      await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_DELAY_MS)
      await settle()
      writeStarted = [...log]
      result = await restoreSnapshot(handle)
    } finally {
      release()
    }
    await settle()

    expect(writeStarted).toEqual([`writeSnapshot:${PROJECT_ID}`])
    expect(result).toEqual(DID_NOT_RESTORE)
    expect(await ports.root.list(AUTOSAVE_PATH)).toContain(REFUSED_COPY_NAME)
    expect(textOf(await ports.root.readFile(`${AUTOSAVE_PATH}/${REFUSED_COPY_NAME}`))).toBe(
      REFUSED_TEXT,
    )
  })
})
