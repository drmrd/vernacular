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
import { START_ADDRESS } from './address'
import { createMemoryAddressBar } from './address-bar'
import { lockedIds, plantProject } from './app-test-support'
import {
  FIRST_ADDRESS,
  FIRST_ID,
  FOLDER_ID,
  FOLDER_NAME,
  MISSING_ADDRESS,
  MISSING_ID,
  NOT_FOUND,
  PROJECTS_ADDRESS,
  SECOND_ADDRESS,
  SECOND_ID,
  THIRD_ID,
  addressOf,
  atTheFirstProject,
  atTheSecondProject,
  durablePortsWith,
  editorOf,
  goBack,
  nameOf,
  openId,
  pageOf,
  renderNavigation,
  reportAgain,
  spiesOnEveryCall,
  startFlow,
  visit,
} from './history-navigation-test-support'
import { resolvePlace } from './resolve-place'
import { gatedFlow, unmountAndSettle } from './use-open-project-test-support'

vi.mock('./resolve-place', async (importOriginal) => {
  const original = await importOriginal<typeof import('./resolve-place')>()
  return { ...original, resolvePlace: vi.fn(original.resolvePlace) }
})

const THIRD_ADDRESS = addressOf(THIRD_ID)
const EDITED_NAME = 'Edited before the move'

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
})

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

  it('puts the bare address back when a move leads to an address that is not exact, over a new project', async () => {
    const bar = createMemoryAddressBar()
    const { result } = renderNavigation(createTestPorts({ durable: true }), bar)
    const handle = await editorOf(result)

    await visit(bar, '#/project/../x')

    await waitFor(() => expect(bar.hash()).toBe(START_ADDRESS))
    expect(bar.entries()).toEqual([START_ADDRESS, START_ADDRESS])
    expect(result.current.handle).toBe(handle)
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
