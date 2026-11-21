import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BACKUP_FOLDER,
  AUTOSAVE_FOLDER,
  PROJECT_ID,
  REFUSED_BACKUP_NAME,
  REFUSED_COPY_NAME,
  REFUSED_TEXT,
  plantRefusedCopy,
  refusedBackupsIn,
} from '../handle/handle-refused-snapshots-test-kit'
import { rename, storedName } from '../handle/handle-test-kit'
import { openStored } from './restore-snapshot-test-kit'
import type { StoredAndOpen } from './restore-snapshot-test-kit'
import { restoreSnapshot } from './restore-snapshot'

const EDITED_NAME = 'Edited before the restore'
const EDITED_AGAIN_NAME = 'Edited after the refused restore'
const DISK_FULL = 'the disk is full'
const AUTOSAVE_PATH = `${PROJECT_ID}/${AUTOSAVE_FOLDER}`
const BACKUP_PATH = `${PROJECT_ID}/${BACKUP_FOLDER}`

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
  const opened = await openStored()
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
    expect(await refusedBackupsIn(ports.root, BACKUP_PATH)).toEqual([
      { name: expect.stringMatching(REFUSED_BACKUP_NAME), text: REFUSED_TEXT },
    ])
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
  })
})
