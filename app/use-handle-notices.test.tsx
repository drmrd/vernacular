import { StrictMode, type ReactNode } from 'react'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { NotificationProvider, useNotifications, type Notification } from '../editor/design-system'
import { renameProject } from '../core'
import type { DocumentHandle } from '../session'
import {
  currentBytes,
  documentOfHigherRevision,
  faultyProject,
} from '../tests/storage/conformance/conformance-documents'
import {
  createTestPorts,
  openOrThrow,
  placeDocument,
  workspaceRequest,
  type TestPorts,
} from '../session/handle/handle-test-kit'
import {
  documentNamed,
  storeNewerMainBesideSecondFile,
} from '../session/handle/second-file-test-kit'
import { createInitialProject } from './create-initial-project'
import {
  SAVED_BY_NEWER_BUILD,
  SAVED_IN_SECOND_FILE,
  SAVED_WITH_FAULTS,
  UNREADABLE_FILE_REPLACED,
  useHandleNotices,
} from './use-handle-notices'

const FAULTS_SENTENCE =
  'This project has a fault in its data. A copy of its last sound state is kept. You can export it.'
const NEWER_BUILD_SENTENCE =
  'A newer version of Vernacular saved this project. The data it added is kept.'
const SECOND_FILE_SENTENCE =
  "A newer version of Vernacular saved this project's plan file, and this version cannot read it. Your changes are saved in a second plan file. You can choose between the two plan files on the Projects page."
const UNREADABLE_FILE_SENTENCE =
  "The stored plan file could not be read. A copy of it is kept with the project's backups."

const FAULTS_NOTIFICATION = { severity: 'warning', message: SAVED_WITH_FAULTS }
const NEWER_BUILD_NOTIFICATION = { severity: 'info', message: SAVED_BY_NEWER_BUILD }
const SECOND_FILE_NOTIFICATION = { severity: 'warning', message: SECOND_FILE_SENTENCE }
const UNREADABLE_FILE_NOTIFICATION = { severity: 'warning', message: UNREADABLE_FILE_SENTENCE }

function WithNotifications({ children }: { children: ReactNode }) {
  return <NotificationProvider>{children}</NotificationProvider>
}

function WithNotificationsInStrictMode({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      <NotificationProvider>{children}</NotificationProvider>
    </StrictMode>
  )
}

/** Mounts the hook on `handle`, and reads the notifications that show beside it. */
function renderNotices(
  handle: DocumentHandle,
  wrapper: typeof WithNotifications = WithNotifications,
) {
  return renderHook(
    ({ current }: { current: DocumentHandle }) => {
      useHandleNotices(current)
      return useNotifications().notifications
    },
    { initialProps: { current: handle }, wrapper },
  )
}

/** The severity and the text of each notification that shows. */
function shown(notifications: readonly Notification[]) {
  return notifications.map(({ severity, message }) => ({ severity, message }))
}

/** A handle on a project that breaks the format rules: its first save raises the faults notice. */
function openFaulty(ports: TestPorts, id = 'faulty'): Promise<DocumentHandle> {
  return openOrThrow(ports, { ...workspaceRequest(id), create: faultyProject })
}

/** A handle on a sound new project, which raises no notice. */
function openSound(ports: TestPorts, id = 'sound'): Promise<DocumentHandle> {
  return openOrThrow(ports, { ...workspaceRequest(id), create: createInitialProject })
}

/** A handle on a project that a newer build saved: it raises its notice while it opens. */
async function openSavedByNewerBuild(ports: TestPorts): Promise<DocumentHandle> {
  await placeDocument(ports, 'newer', documentOfHigherRevision())
  return openOrThrow(ports, workspaceRequest('newer'))
}

/** A handle that read the second file of a project beside a newer main file: it raises its notice while it opens. */
async function openReadingSecondFile(ports: TestPorts): Promise<DocumentHandle> {
  await storeNewerMainBesideSecondFile(ports, 'beside', documentNamed('In the second file'))
  return openOrThrow(ports, workspaceRequest('beside'))
}

/** A handle on a stored project whose main file holds bytes that no build can read by the time it saves. */
async function openOverUnreadableFile(ports: TestPorts): Promise<DocumentHandle> {
  await placeDocument(ports, 'unreadable', currentBytes())
  const handle = await openOrThrow(ports, workspaceRequest('unreadable'))
  await placeDocument(ports, 'unreadable', new TextEncoder().encode('{ not json'))
  return handle
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('the sentences of the notices of a handle', () => {
  it('read as they are written for the user', () => {
    expect(SAVED_WITH_FAULTS).toBe(FAULTS_SENTENCE)
    expect(SAVED_BY_NEWER_BUILD).toBe(NEWER_BUILD_SENTENCE)
    expect(SAVED_IN_SECOND_FILE).toBe(SECOND_FILE_SENTENCE)
    expect(UNREADABLE_FILE_REPLACED).toBe(UNREADABLE_FILE_SENTENCE)
  })
})

describe('useHandleNotices', () => {
  it('shows the sentence of saved-with-faults once, as a warning, under StrictMode', async () => {
    const handle = await openFaulty(createTestPorts())
    const { result } = renderNotices(handle, WithNotificationsInStrictMode)

    await act(async () => {
      await handle.save()
    })

    expect(shown(result.current)).toEqual([FAULTS_NOTIFICATION])
  })

  it('shows the sentence of saved-by-newer-build once, as an info, under StrictMode', async () => {
    const handle = await openSavedByNewerBuild(createTestPorts())

    const { result } = renderNotices(handle, WithNotificationsInStrictMode)

    expect(shown(result.current)).toEqual([NEWER_BUILD_NOTIFICATION])
  })

  it('shows a notice that was raised before the hook mounted when it mounts', async () => {
    const handle = await openFaulty(createTestPorts())
    await handle.save()

    const { result } = renderNotices(handle)

    expect(shown(result.current)).toEqual([FAULTS_NOTIFICATION])
  })

  it('shows the held notice of a new handle after a rerender', async () => {
    const ports = createTestPorts()
    const first = await openSound(ports)
    const second = await openSavedByNewerBuild(ports)
    const { result, rerender } = renderNotices(first)

    rerender({ current: second })

    expect(shown(result.current)).toEqual([NEWER_BUILD_NOTIFICATION])
  })

  it('does not show a notice of a handle that was replaced for the new one', async () => {
    const ports = createTestPorts()
    const replaced = await openFaulty(ports)
    const replacement = await openSound(ports)
    const { result, rerender } = renderNotices(replaced)
    rerender({ current: replacement })

    await act(async () => {
      await replaced.save()
    })

    expect(shown(result.current)).toEqual([])
  })
})

describe('useHandleNotices for a project with a second file', () => {
  it('shows the sentence of saved-in-second-file once, as a warning, under StrictMode', async () => {
    const handle = await openReadingSecondFile(createTestPorts())

    const { result } = renderNotices(handle, WithNotificationsInStrictMode)

    expect(shown(result.current)).toEqual([SECOND_FILE_NOTIFICATION])
  })

  it('shows the sentence of unreadable-file-replaced once, as a warning, under StrictMode', async () => {
    const handle = await openOverUnreadableFile(createTestPorts())
    const { result } = renderNotices(handle, WithNotificationsInStrictMode)

    await act(async () => {
      handle.session.dispatch(renameProject('Edited'))
      await handle.save()
    })

    expect(shown(result.current)).toEqual([UNREADABLE_FILE_NOTIFICATION])
  })
})
