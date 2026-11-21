import { act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openRecent } from '../session'
import { settle } from '../session/autosave/save-gate-test-kit'
import {
  createTestPorts,
  holdNextRead,
  rememberFolder,
  rename,
  storedName,
} from '../session/handle/handle-test-kit'
import { documentNamed, folderRecord } from '../session/projects/rebuild-test-kit'
import { createMemoryAddressBar } from './address-bar'
import { lockedIds, plantProject } from './app-test-support'
import type { NavigationResult } from './history-navigation-test-support'
import {
  FIRST_ID,
  MISSING_ID,
  PROJECTS_ADDRESS,
  SECOND_ID,
  THIRD_ID,
  addressOf,
  durablePortsWith,
  editorOf,
  goBack,
  nameOf,
  pageOf,
  renderNavigation,
  reportAgain,
  runFlowIn,
  spiesOnEveryCall,
  startFlow,
  switchTo,
  visit,
} from './history-navigation-test-support'
import { resolvePlace } from './resolve-place'
import { gatedFlow, unmountAndSettle } from './use-open-project-test-support'

vi.mock('./resolve-place', async (importOriginal) => {
  const original = await importOriginal<typeof import('./resolve-place')>()
  return { ...original, resolvePlace: vi.fn(original.resolvePlace) }
})

const FIRST_ADDRESS = addressOf(FIRST_ID)
const SECOND_ADDRESS = addressOf(SECOND_ID)
const THIRD_ADDRESS = addressOf(THIRD_ID)
const MISSING_ADDRESS = addressOf(MISSING_ID)
const NOT_FOUND = { kind: 'not-found' }
const EDITED_NAME = 'Edited before the move'
const FOLDER_ID = 'project-folder'
const FOLDER_NAME = 'Kept in a folder'

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
})

/** The navigation on durable ports with three projects, open on the first one at the bare address. */
async function atTheFirstProject() {
  const ports = await durablePortsWith(FIRST_ID, SECOND_ID, THIRD_ID)
  const bar = createMemoryAddressBar()
  const rendered = renderNavigation(ports, bar)
  const handle = await editorOf(rendered.result)
  await waitFor(() => expect(bar.hash()).toBe(FIRST_ADDRESS))
  await act(settle)
  return { ports, bar, handle, ...rendered }
}

/** The same, after a switch to the second project: the entries are the first and the second. */
async function atTheSecondProject() {
  const start = await atTheFirstProject()
  await runFlowIn(start.result, switchTo(SECOND_ID))
  await waitFor(() => expect(start.bar.entries()).toEqual([FIRST_ADDRESS, SECOND_ADDRESS]))
  const handle = await editorOf(start.result)
  await act(settle)
  return { ...start, handle }
}

/** The id of the project that is open now. */
function openId(result: NavigationResult): string | undefined {
  return result.current.handle?.id
}

describe('a move through the history with a project open', () => {
  it('switches to the project of the address after a move back', async () => {
    const { ports, bar, result } = await atTheSecondProject()

    await goBack(bar)

    await waitFor(() => expect(openId(result)).toBe(FIRST_ID))
    expect(result.current.screen?.kind).toBe('editor')
    expect(lockedIds(ports)).toEqual([FIRST_ID])
    expect(bar.entries()).toEqual([FIRST_ADDRESS, SECOND_ADDRESS])
    expect(bar.position()).toBe(0)
  })

  it('saves the changes of the open project before a move back opens another', async () => {
    const { ports, bar, result, handle } = await atTheSecondProject()
    act(() => rename(handle, EDITED_NAME))
    expect(await storedName(ports.workspace, SECOND_ID)).toBe(nameOf(SECOND_ID))

    await goBack(bar)

    await waitFor(() => expect(openId(result)).toBe(FIRST_ID))
    expect(await storedName(ports.workspace, SECOND_ID)).toBe(EDITED_NAME)
  })

  it('shows the page with the project still open after a move to the projects address', async () => {
    const { ports, bar, result, handle } = await atTheFirstProject()

    await visit(bar, PROJECTS_ADDRESS)

    expect(await pageOf(result)).toStrictEqual({ kind: 'projects' })
    expect(result.current.handle).toBe(handle)
    expect(lockedIds(ports)).toEqual([FIRST_ID])
    expect(bar.entries()).toEqual([FIRST_ADDRESS, PROJECTS_ADDRESS])
  })

  it('returns to the project with one new entry when the page is left', async () => {
    const { bar, result, handle } = await atTheFirstProject()
    await visit(bar, PROJECTS_ADDRESS)
    await pageOf(result)

    act(() => result.current.leavePage())

    expect(await editorOf(result)).toBe(handle)
    await waitFor(() =>
      expect(bar.entries()).toEqual([FIRST_ADDRESS, PROJECTS_ADDRESS, FIRST_ADDRESS]),
    )
  })

  it('hides the page and starts no switch after a move to the address of the open project', async () => {
    const { ports, bar, result, handle } = await atTheFirstProject()
    await visit(bar, PROJECTS_ADDRESS)
    await pageOf(result)
    const calls = spiesOnEveryCall(ports)
    vi.mocked(resolvePlace).mockClear()

    await goBack(bar)

    expect(await editorOf(result)).toBe(handle)
    await act(settle)
    expect(resolvePlace).not.toHaveBeenCalled()
    for (const call of calls) expect(call).not.toHaveBeenCalled()
    expect(bar.entries()).toEqual([FIRST_ADDRESS, PROJECTS_ADDRESS])
  })

  it('keeps the open project after a move to the bare address and puts its address there', async () => {
    const { ports, bar, result, handle } = await atTheFirstProject()
    const calls = spiesOnEveryCall(ports)
    vi.mocked(resolvePlace).mockClear()

    await visit(bar, '')

    await waitFor(() => expect(bar.entries()).toEqual([FIRST_ADDRESS, FIRST_ADDRESS]))
    expect(result.current.handle).toBe(handle)
    expect(result.current.screen).toEqual({ kind: 'editor', handle })
    expect(resolvePlace).not.toHaveBeenCalled()
    for (const call of calls) expect(call).not.toHaveBeenCalled()
  })

  it('leaves the project open and shows the notice when a move leads to a project that does not open', async () => {
    const { ports, bar, result, handle } = await atTheFirstProject()

    await visit(bar, MISSING_ADDRESS)

    const page = await pageOf(result)
    expect(page.notice).toStrictEqual({ id: MISSING_ID, failure: NOT_FOUND })
    expect(result.current.handle).toBe(handle)
    expect(lockedIds(ports)).toEqual([FIRST_ID])
    expect(bar.entries()).toEqual([FIRST_ADDRESS, MISSING_ADDRESS])
  })
})

describe('a retry and a move with no project open', () => {
  it('opens the project of the address at a retry after it did not open', async () => {
    const ports = createTestPorts({ durable: true })
    const bar = createMemoryAddressBar(MISSING_ADDRESS)
    const { result } = renderNavigation(ports, bar)
    expect((await pageOf(result)).notice?.failure).toEqual(NOT_FOUND)
    await plantProject(ports, MISSING_ID, nameOf(MISSING_ID))

    act(() => result.current.retry())

    expect((await editorOf(result)).id).toBe(MISSING_ID)
    expect(bar.entries()).toEqual([MISSING_ADDRESS])
  })

  it('asks for the folder inside the retry of a permission notice', async () => {
    const ports = createTestPorts()
    await rememberFolder(ports, FOLDER_ID, documentNamed(FOLDER_NAME))
    await ports.index.put(folderRecord(FOLDER_ID))
    ports.folders.setPermission(FOLDER_ID, 'prompt')
    const reopen = vi.spyOn(ports.folders, 'reopen')
    const { result } = renderNavigation(ports, createMemoryAddressBar())
    const page = await pageOf(result)
    expect(page.notice).toStrictEqual({ id: FOLDER_ID, failure: { kind: 'folder-permission' } })
    expect(reopen).not.toHaveBeenCalled()

    act(() => result.current.retry())

    const handle = await editorOf(result)
    expect(handle.session.getProject().meta.name).toBe(FOLDER_NAME)
    expect(reopen).toHaveBeenCalledWith(FOLDER_ID)
  })

  it('opens the project of the address after a move with no project open', async () => {
    const ports = await durablePortsWith(SECOND_ID)
    const bar = createMemoryAddressBar(PROJECTS_ADDRESS)
    const { result } = renderNavigation(ports, bar)
    await pageOf(result)

    await visit(bar, SECOND_ADDRESS)

    expect((await editorOf(result)).id).toBe(SECOND_ID)
    expect(lockedIds(ports)).toEqual([SECOND_ID])
    expect(bar.entries()).toEqual([PROJECTS_ADDRESS, SECOND_ADDRESS])
  })
})

describe('a move while the start or a flow runs', () => {
  it('follows the latest address when the user moves twice during one switch', async () => {
    const { ports, bar, result, handle } = await atTheFirstProject()
    const locks = vi.spyOn(ports.locks, 'tryAcquire')
    const letReadEnd = holdNextRead(ports.workspace)

    await visit(bar, SECOND_ADDRESS)
    await act(settle)
    await visit(bar, THIRD_ADDRESS)
    await visit(bar, FIRST_ADDRESS)
    expect(result.current.handle).toBe(handle)
    await act(async () => letReadEnd())

    await waitFor(() => expect(result.current.handle).not.toBe(handle))
    await waitFor(() => expect(openId(result)).toBe(FIRST_ID))
    expect(locks.mock.calls.map(([id]) => id)).toEqual([SECOND_ID, FIRST_ID])
    expect(lockedIds(ports)).toEqual([FIRST_ID])
    expect(bar.entries()).toEqual([FIRST_ADDRESS, SECOND_ADDRESS, THIRD_ADDRESS, FIRST_ADDRESS])
  })

  it('follows a move that came while a flow of the editor ran, after that flow ended', async () => {
    const { ports, bar, result, handle } = await atTheFirstProject()
    const locks = vi.spyOn(ports.locks, 'tryAcquire')
    const held = gatedFlow((given, current) => openRecent(given, current, FIRST_ID))
    const running = startFlow(result, held.flow)

    await visit(bar, SECOND_ADDRESS)
    await act(settle)
    expect(result.current.handle).toBe(handle)
    expect(locks).not.toHaveBeenCalled()
    await act(async () => {
      held.letEnd()
      await running
    })

    await waitFor(() => expect(openId(result)).toBe(SECOND_ID))
    expect(lockedIds(ports)).toEqual([SECOND_ID])
    expect(bar.entries()).toEqual([FIRST_ADDRESS, SECOND_ADDRESS])
  })

  it('follows a move that came while the start ran, after the start ended', async () => {
    const ports = await durablePortsWith(FIRST_ID, SECOND_ID)
    const letReadEnd = holdNextRead(ports.workspace)
    const bar = createMemoryAddressBar()
    const { result } = renderNavigation(ports, bar)
    await act(settle)

    await visit(bar, SECOND_ADDRESS)
    expect(result.current.handle).toBeNull()
    await act(async () => letReadEnd())

    await waitFor(() => expect(openId(result)).toBe(SECOND_ID))
    expect(lockedIds(ports)).toEqual([SECOND_ID])
    expect(bar.entries()).toEqual(['', SECOND_ADDRESS])
  })

  it('starts one switch when the same move is reported twice', async () => {
    const { ports, bar, result, handles } = await atTheSecondProject()
    const locks = vi.spyOn(ports.locks, 'tryAcquire')
    const handlesBefore = handles.length
    const letReadEnd = holdNextRead(ports.workspace)
    vi.mocked(resolvePlace).mockClear()

    await goBack(bar)
    await act(settle)
    await reportAgain(bar)
    await act(async () => letReadEnd())
    await waitFor(() => expect(openId(result)).toBe(FIRST_ID))
    await reportAgain(bar)
    await act(settle)

    expect(resolvePlace).toHaveBeenCalledTimes(1)
    expect(locks).toHaveBeenCalledTimes(1)
    expect(handles.length - handlesBefore).toBe(1)
    expect(result.current.screen).toEqual({ kind: 'editor', handle: result.current.handle })
    expect(bar.entries()).toEqual([FIRST_ADDRESS, SECOND_ADDRESS])
  })
})

describe('the hook after it is unmounted', () => {
  it('writes no address after the hook is unmounted', async () => {
    const { bar, result, unmount } = await atTheFirstProject()
    const held = gatedFlow((given) => openRecent(given, undefined, SECOND_ID))
    const running = startFlow(result, held.flow)

    await unmountAndSettle(unmount)
    await act(async () => {
      held.letEnd()
      await running
    })

    const outcome = await running
    if (outcome?.ok) await outcome.handle.close()
    expect(bar.entries()).toEqual([FIRST_ADDRESS])
  })
})
