import { afterEach, describe, expect, it, vi } from 'vitest'
import { FolderFiles } from '../project-files/folder-files'
import { BrowserFolderAccess } from './folder-access'
import {
  FIRST_ID,
  MapHandles,
  READ_WRITE,
  SECOND_ID,
  StandInHandle,
  accessRemembering,
} from './folder-access-test-kit'

function describePermission(): void {
  it('reports a folder with no remembered handle as missing', async () => {
    expect(await new BrowserFolderAccess(new MapHandles()).permission(FIRST_ID)).toBe('missing')
  })

  it.each(['granted', 'prompt', 'denied'] as const)(
    'passes the %s answer of the handle through',
    async (answer) => {
      const stand = new StandInHandle('x', { query: answer })
      const access = await accessRemembering(FIRST_ID, stand)

      expect(await access.permission(FIRST_ID)).toBe(answer)
    },
  )

  it('asks the handle for read and write access', async () => {
    const stand = new StandInHandle('x')
    const access = await accessRemembering(FIRST_ID, stand)

    await access.permission(FIRST_ID)

    expect(stand.queried).toEqual([READ_WRITE])
  })
}

function describeReopen(): void {
  it('reports a folder with no remembered handle as missing on reopen', async () => {
    expect(await new BrowserFolderAccess(new MapHandles()).reopen(FIRST_ID)).toBe('missing')
  })

  it.each(['denied', 'prompt'] as const)(
    'reports a folder as denied on reopen when the request answers %s',
    async (answer) => {
      const access = await accessRemembering(FIRST_ID, new StandInHandle('x', { request: answer }))

      expect(await access.reopen(FIRST_ID)).toBe('denied')
    },
  )

  it('gives the files of a folder when the request answers granted', async () => {
    const access = await accessRemembering(FIRST_ID, new StandInHandle('x'))

    expect(await access.reopen(FIRST_ID)).toBeInstanceOf(FolderFiles)
  })

  it('asks the handle for read and write access on reopen', async () => {
    const stand = new StandInHandle('x')
    const access = await accessRemembering(FIRST_ID, stand)

    await access.reopen(FIRST_ID)

    expect(stand.requested).toEqual([READ_WRITE])
  })
}

function describeFindKnown(): void {
  it('finds the id whose stored handle is the same entry', async () => {
    const handles = new MapHandles()
    await handles.put(FIRST_ID, new StandInHandle('one').asHandle())
    await handles.put(SECOND_ID, new StandInHandle('two').asHandle())
    const access = new BrowserFolderAccess(handles)

    expect(await access.findKnown(new StandInHandle('two').asHandle())).toBe(SECOND_ID)
  })

  it('finds nothing when no stored handle is the same entry', async () => {
    const access = await accessRemembering(FIRST_ID, new StandInHandle('one'))

    expect(await access.findKnown(new StandInHandle('other').asHandle())).toBeUndefined()
  })

  it('finds the lower id when two ids hold the same entry', async () => {
    const handles = new MapHandles()
    await handles.put(SECOND_ID, new StandInHandle('same').asHandle())
    await handles.put(FIRST_ID, new StandInHandle('same').asHandle())
    const access = new BrowserFolderAccess(handles)

    expect(await access.findKnown(new StandInHandle('same').asHandle())).toBe(FIRST_ID)
  })
}

function describeRemembering(): void {
  it('holds the handle once it is remembered and not after it is forgotten', async () => {
    const handles = new MapHandles()
    const access = new BrowserFolderAccess(handles)
    const handle = new StandInHandle('x').asHandle()

    await access.remember(FIRST_ID, handle)
    expect(await handles.get(FIRST_ID)).toBe(handle)

    await access.forget(FIRST_ID)
    expect(await handles.get(FIRST_ID)).toBeUndefined()
  })
}

function describePicker(): void {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is unsupported without a folder picker', () => {
    expect(new BrowserFolderAccess(new MapHandles()).supported).toBe(false)
  })

  it('is supported with a folder picker', () => {
    vi.stubGlobal('showDirectoryPicker', vi.fn())

    expect(new BrowserFolderAccess(new MapHandles()).supported).toBe(true)
  })

  it('gives the picked handle after asking the picker for read and write access', async () => {
    const handle = new StandInHandle('x').asHandle()
    const picker = vi.fn().mockResolvedValue(handle)
    vi.stubGlobal('showDirectoryPicker', picker)

    expect(await new BrowserFolderAccess(new MapHandles()).pick()).toBe(handle)
    expect(picker).toHaveBeenCalledWith(READ_WRITE)
  })

  it('gives nothing when the user cancels the picker', async () => {
    vi.stubGlobal('showDirectoryPicker', vi.fn().mockRejectedValue(pickerFailure('AbortError')))

    expect(await new BrowserFolderAccess(new MapHandles()).pick()).toBeUndefined()
  })

  it('rejects with the same error when the picker fails for another reason', async () => {
    const failure = pickerFailure('SecurityError')
    vi.stubGlobal('showDirectoryPicker', vi.fn().mockRejectedValue(failure))

    await expect(new BrowserFolderAccess(new MapHandles()).pick()).rejects.toBe(failure)
  })
}

/** A picker failure of the given name. */
function pickerFailure(name: string): DOMException {
  return new DOMException('The picker did not give a folder.', name)
}

describe('BrowserFolderAccess permission', describePermission)
describe('BrowserFolderAccess reopening', describeReopen)
describe('BrowserFolderAccess finding a known folder', describeFindKnown)
describe('BrowserFolderAccess remembering', describeRemembering)
describe('BrowserFolderAccess folder picker', describePicker)
