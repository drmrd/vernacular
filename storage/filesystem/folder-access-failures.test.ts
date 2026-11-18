import { describe, expect, it } from 'vitest'
import { FolderFiles } from '../project-files/folder-files'
import { BrowserFolderAccess } from './folder-access'
import {
  FIRST_ID,
  MapHandles,
  SECOND_ID,
  StandInHandle,
  accessRemembering,
  type Failure,
} from './folder-access-test-kit'

const GONE = new DOMException('gone', 'NotFoundError')
const REJECTION: Failure = { error: GONE }
const THROWN: Failure = { error: GONE, synchronously: true }

async function twoRemembered(first: StandInHandle, second: StandInHandle) {
  const handles = new MapHandles()
  await handles.put(FIRST_ID, first.asHandle())
  await handles.put(SECOND_ID, second.asHandle())
  return new BrowserFolderAccess(handles)
}

function describeFindKnownFailures(): void {
  it.each([
    ['rejects', REJECTION],
    ['throws', THROWN],
  ])('skips a remembered handle whose isSameEntry %s and goes on', async (_how, failure) => {
    const broken = new StandInHandle('same', { failing: { isSameEntry: failure } })
    const access = await twoRemembered(broken, new StandInHandle('same'))

    expect(await access.findKnown(new StandInHandle('same').asHandle())).toBe(SECOND_ID)
  })

  it.each([
    ['rejects', REJECTION],
    ['throws', THROWN],
  ])(
    'finds nothing when the only remembered handle has an isSameEntry that %s',
    async (_how, failure) => {
      const broken = new StandInHandle('same', { failing: { isSameEntry: failure } })
      const access = await accessRemembering(FIRST_ID, broken)

      expect(await access.findKnown(new StandInHandle('same').asHandle())).toBeUndefined()
    },
  )
}

function describePermissionFailures(): void {
  it.each([
    ['rejects', REJECTION],
    ['throws', THROWN],
  ])('reports a folder as missing when queryPermission %s', async (_how, failure) => {
    const stand = new StandInHandle('x', { failing: { query: failure } })
    const access = await accessRemembering(FIRST_ID, stand)

    expect(await access.permission(FIRST_ID)).toBe('missing')
  })
}

function describeReopenFailures(): void {
  const denials = [
    ['SecurityError', new DOMException('no gesture', 'SecurityError')],
    ['NotAllowedError', new DOMException('refused', 'NotAllowedError')],
  ] as const

  it.each(denials)(
    'reports a folder as denied when the request fails with %s',
    async (_n, error) => {
      const stand = new StandInHandle('x', { failing: { request: { error } } })
      const access = await accessRemembering(FIRST_ID, stand)

      expect(await access.reopen(FIRST_ID)).toBe('denied')
    },
  )

  it('reports a folder as missing when the request fails with NotFoundError', async () => {
    const stand = new StandInHandle('x', { failing: { request: REJECTION } })
    const access = await accessRemembering(FIRST_ID, stand)

    expect(await access.reopen(FIRST_ID)).toBe('missing')
  })

  it.each([
    ['a DOMException named InvalidStateError', new DOMException('odd', 'InvalidStateError')],
    ['a plain error', new Error('odd')],
  ])('rejects with the same error object when the request fails with %s', async (_n, error) => {
    const stand = new StandInHandle('x', { failing: { request: { error } } })
    const access = await accessRemembering(FIRST_ID, stand)

    await expect(access.reopen(FIRST_ID)).rejects.toBe(error)
  })

  it('still gives files when the request is granted', async () => {
    const access = await accessRemembering(FIRST_ID, new StandInHandle('x'))

    expect(await access.reopen(FIRST_ID)).toBeInstanceOf(FolderFiles)
  })
}

function describeStoreFailures(): void {
  const failure = new Error('the handle store is broken')

  it('rejects permission with the error of a handle store whose get fails', async () => {
    const access = new BrowserFolderAccess(new MapHandles({ get: failure }))

    await expect(access.permission(FIRST_ID)).rejects.toBe(failure)
  })

  it('rejects reopen with the error of a handle store whose get fails', async () => {
    const access = new BrowserFolderAccess(new MapHandles({ get: failure }))

    await expect(access.reopen(FIRST_ID)).rejects.toBe(failure)
  })

  it('rejects findKnown with the error of a handle store whose entries fail', async () => {
    const access = new BrowserFolderAccess(new MapHandles({ entries: failure }))

    await expect(access.findKnown(new StandInHandle('x').asHandle())).rejects.toBe(failure)
  })
}

describe(
  'BrowserFolderAccess finding a known folder among failing handles',
  describeFindKnownFailures,
)
describe('BrowserFolderAccess permission of a failing handle', describePermissionFailures)
describe('BrowserFolderAccess reopening when the request fails', describeReopenFailures)
describe('BrowserFolderAccess over a failing handle store', describeStoreFailures)
