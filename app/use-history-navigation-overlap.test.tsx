import { act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { settle } from '../session/autosave/save-gate-test-kit'
import { holdNextRead, rememberFolder } from '../session/handle/handle-test-kit'
import { documentNamed, folderRecord } from '../session/projects/rebuild-test-kit'
import { createMemoryAddressBar } from './address-bar'
import { plantProject } from './app-test-support'
import {
  FIRST_ID,
  MISSING_ID,
  PROJECTS_ADDRESS,
  SECOND_ID,
  THIRD_ID,
  addressOf,
  atTheFirstProject,
  durablePortsWith,
  editorOf,
  nameOf,
  openId,
  pageOf,
  renderNavigation,
  reportAgain,
  startFlow,
  switchTo,
  visit,
} from './history-navigation-test-support'
import { resolvePlace } from './resolve-place'

vi.mock('./resolve-place', async (importOriginal) => {
  const original = await importOriginal<typeof import('./resolve-place')>()
  return { ...original, resolvePlace: vi.fn(original.resolvePlace) }
})

const FIRST_ADDRESS = addressOf(FIRST_ID)
const SECOND_ADDRESS = addressOf(SECOND_ID)
const MISSING_ADDRESS = addressOf(MISSING_ID)
const NOT_FOUND = { kind: 'not-found' }
const FOLDER_ID = 'project-folder'
const FOLDER_NAME = 'Kept in a folder'

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('a switch by address while the owner refuses another flow', () => {
  it('keeps a switch by address running when the owner refuses another flow', async () => {
    const { ports, bar, result } = await atTheFirstProject()
    const letReadEnd = holdNextRead(ports.workspace)
    await visit(bar, SECOND_ADDRESS)
    await act(settle)

    const refusal = startFlow(result, switchTo(THIRD_ID))
    await act(settle)
    await visit(bar, PROJECTS_ADDRESS)
    await act(settle)
    await act(async () => letReadEnd())

    await expect(refusal).resolves.toBeUndefined()
    await waitFor(() => expect(openId(result)).toBe(SECOND_ID))
    await act(settle)
    expect(result.current.screen).toStrictEqual({ kind: 'projects' })
    expect(bar.entries()).toEqual([FIRST_ADDRESS, SECOND_ADDRESS, PROJECTS_ADDRESS])
  })
})

describe('a move to a project that does not open, reported twice', () => {
  it('starts one switch when a move to a project that does not open is reported twice', async () => {
    const { ports, bar, result, handle } = await atTheFirstProject()
    const letReadEnd = holdNextRead(ports.workspace)
    vi.mocked(resolvePlace).mockClear()

    await visit(bar, MISSING_ADDRESS)
    await act(settle)
    await reportAgain(bar)
    await act(async () => letReadEnd())
    const page = await pageOf(result)
    await reportAgain(bar)
    await act(settle)

    expect(resolvePlace).toHaveBeenCalledTimes(1)
    expect(page.notice).toStrictEqual({ id: MISSING_ID, failure: NOT_FOUND })
    expect(result.current.screen).toStrictEqual(page)
    expect(result.current.handle).toBe(handle)
    expect(bar.entries()).toEqual([FIRST_ADDRESS, MISSING_ADDRESS])
  })
})

describe('a retry with a project open', () => {
  it('opens the project of the address at a retry after it did not open', async () => {
    const { ports, bar, result } = await atTheFirstProject()
    await visit(bar, MISSING_ADDRESS)
    expect((await pageOf(result)).notice?.failure).toEqual(NOT_FOUND)
    await plantProject(ports, MISSING_ID, nameOf(MISSING_ID))

    act(() => result.current.retry())

    await waitFor(() => expect(openId(result)).toBe(MISSING_ID))
    expect(bar.entries()).toEqual([FIRST_ADDRESS, MISSING_ADDRESS])
  })

  it('asks for the folder inside the retry of a permission notice', async () => {
    const ports = await durablePortsWith(FIRST_ID)
    await rememberFolder(ports, FOLDER_ID, documentNamed(FOLDER_NAME))
    await ports.index.put(folderRecord(FOLDER_ID))
    ports.folders.setPermission(FOLDER_ID, 'prompt')
    const reopen = vi.spyOn(ports.folders, 'reopen')
    const bar = createMemoryAddressBar()
    const { result } = renderNavigation(ports, bar)
    await editorOf(result)
    await visit(bar, addressOf(FOLDER_ID))
    expect((await pageOf(result)).notice).toStrictEqual({
      id: FOLDER_ID,
      failure: { kind: 'folder-permission' },
    })
    expect(reopen).not.toHaveBeenCalled()

    act(() => result.current.retry())

    await waitFor(() => expect(openId(result)).toBe(FOLDER_ID))
    expect(reopen).toHaveBeenCalledWith(FOLDER_ID)
  })
})
