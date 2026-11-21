import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { currentBytes } from '../../tests/storage/conformance/conformance-documents'
import { DEFAULT_AUTOSAVE_DELAY_MS } from '../autosave/create-autosave'
import { settle } from '../autosave/save-gate-test-kit'
import { restoreSnapshot } from '../flows/restore-snapshot'
import {
  IN_FOLDER,
  createTestPorts,
  failureOf,
  handleOf,
  openOrThrow,
  placeDocument,
  rememberFolder,
  rename,
  storedName,
  workspaceRequest,
} from './handle-test-kit'
import {
  AUTOSAVE_FOLDER,
  BACKUP_FOLDER,
  NEWEST_COPY_NAME,
  PROJECT_ID,
  READABLE_NAME,
  REFUSED_COPY_NAME,
  REFUSED_TEXT,
  THE_REFUSED_BACKUP,
  autosaveFolderOf,
  backupFolderOf,
  namesIn,
  noticesOf,
  openLeavingSnapshots,
  openProject,
  plantRefusedCopy,
  portsWithRefusedCopy,
  refusedBackupsIn,
  rejectSetAside,
  textOf,
  writeReadableCopy,
} from './handle-refused-snapshots-test-kit'

const RECOVERY_COPY_KEPT = 'recovery-copy-kept'
const EDITED_NAME = 'Edited after the open'
const DISK_FULL = 'the disk is full'

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('an open of a project with a recovery copy that cannot be read', () => {
  it('an open moves a recovery copy that does not decode to the backups, byte for byte', async () => {
    const ports = await portsWithRefusedCopy()

    await openProject(ports)

    expect(await refusedBackupsIn(ports.root, backupFolderOf(PROJECT_ID))).toEqual(
      THE_REFUSED_BACKUP,
    )
    expect(await ports.root.list(autosaveFolderOf(PROJECT_ID))).not.toContain(REFUSED_COPY_NAME)
  })

  it('the handle gives the notice recovery-copy-kept once, also to a listener that attaches later', async () => {
    const handle = await openProject(await portsWithRefusedCopy())

    const firstListener = noticesOf(handle)
    const laterListener = noticesOf(handle)
    await handle.save()

    expect(firstListener).toEqual([RECOVERY_COPY_KEPT])
    expect(laterListener).toEqual([])
  })

  it('an open with only readable copies moves nothing and gives no notice', async () => {
    const ports = createTestPorts()
    await placeDocument(ports, PROJECT_ID, currentBytes())
    await writeReadableCopy(ports)
    const before = await namesIn(ports.root, autosaveFolderOf(PROJECT_ID))

    const handle = await openProject(ports)

    expect(await namesIn(ports.root, autosaveFolderOf(PROJECT_ID))).toEqual(before)
    expect(await refusedBackupsIn(ports.root, backupFolderOf(PROJECT_ID))).toEqual([])
    expect(noticesOf(handle)).toEqual([])
  })

  it('a readable copy beside a refused one stays recoverable and restores', async () => {
    const ports = await portsWithRefusedCopy(NEWEST_COPY_NAME)
    await writeReadableCopy(ports)
    const handle = await openProject(ports)

    const recoverable = await handle.snapshots.isRecoverable()
    const restored = handleOf(await restoreSnapshot(handle))

    expect(recoverable).toBe(true)
    expect(restored.session.getProject().meta.name).toBe(READABLE_NAME)
  })

  it('the refused copy is still in the backups after an edit and the autosave that follows', async () => {
    const ports = await portsWithRefusedCopy()
    const handle = await openProject(ports)
    rename(handle, EDITED_NAME)

    await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_DELAY_MS)
    await settle()
    await handle.close()

    expect(await storedName(ports.workspace, PROJECT_ID)).toBe(EDITED_NAME)
    expect(await refusedBackupsIn(ports.root, backupFolderOf(PROJECT_ID))).toEqual(
      THE_REFUSED_BACKUP,
    )
  })
})

describe('an open that does not set a recovery copy aside', () => {
  it('an open that leaves the snapshots alone moves nothing', async () => {
    const ports = await portsWithRefusedCopy()

    const handle = await openLeavingSnapshots(ports)

    expect(
      textOf(await ports.root.readFile(`${autosaveFolderOf(PROJECT_ID)}/${REFUSED_COPY_NAME}`)),
    ).toBe(REFUSED_TEXT)
    expect(await refusedBackupsIn(ports.root, backupFolderOf(PROJECT_ID))).toEqual([])
    expect(noticesOf(handle)).toEqual([])
  })

  it('an open that fails moves nothing', async () => {
    const ports = await portsWithRefusedCopy()
    await placeDocument(ports, PROJECT_ID, new TextEncoder().encode(REFUSED_TEXT))

    const failure = await failureOf(ports, workspaceRequest(PROJECT_ID))

    expect(failure).toMatchObject({ kind: 'did-not-open' })
    expect(await ports.root.list(autosaveFolderOf(PROJECT_ID))).toContain(REFUSED_COPY_NAME)
    expect(await refusedBackupsIn(ports.root, backupFolderOf(PROJECT_ID))).toEqual([])
  })
})

describe('an open whose move of a recovery copy rejects', () => {
  it('an open whose move rejects still opens, logs one error, and its autosave writes and removes no snapshot', async () => {
    const ports = await portsWithRefusedCopy()
    const snapshotCalls = rejectSetAside(ports.workspace, new Error(DISK_FULL))

    const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))
    rename(handle, EDITED_NAME)
    await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_DELAY_MS)
    await settle()
    await handle.save()
    await handle.close()

    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(snapshotCalls).toEqual([])
    expect(await storedName(ports.workspace, PROJECT_ID)).toBe(EDITED_NAME)
    expect(await ports.root.list(autosaveFolderOf(PROJECT_ID))).toContain(REFUSED_COPY_NAME)
  })
})

describe('an open of a project in a folder', () => {
  it('a folder project moves its refused copy into the backups of the folder', async () => {
    const ports = createTestPorts()
    const folder = await rememberFolder(ports, PROJECT_ID, currentBytes())
    await plantRefusedCopy(folder, AUTOSAVE_FOLDER)

    await openOrThrow(ports, { id: PROJECT_ID, location: IN_FOLDER })

    expect(await refusedBackupsIn(folder, BACKUP_FOLDER)).toEqual(THE_REFUSED_BACKUP)
    expect(await folder.list(AUTOSAVE_FOLDER)).not.toContain(REFUSED_COPY_NAME)
    expect(await refusedBackupsIn(ports.root, backupFolderOf(PROJECT_ID))).toEqual([])
  })
})
