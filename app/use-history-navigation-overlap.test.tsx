import { act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { settle } from '../session/autosave/save-gate-test-kit'
import { holdNextRead, rememberFolder } from '../session/handle/handle-test-kit'
import { documentNamed, folderRecord } from '../session/projects/rebuild-test-kit'
import { createMemoryAddressBar } from './address-bar'
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
  durablePortsWith,
  editorOf,
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

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('a move during a switch by address while the owner refuses another flow', () => {
  it('follows the move made during the switch after it ends, and keeps the entries', async () => {
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

describe('a second retry while the folder prompt waits', () => {
  it('follows a move made while a folder retry waits, after a second retry was refused', async () => {
    const ports = await durablePortsWith(FIRST_ID)
    await rememberFolder(ports, FOLDER_ID, documentNamed(FOLDER_NAME))
    await ports.index.put(folderRecord(FOLDER_ID))
    ports.folders.setPermission(FOLDER_ID, 'prompt')
    const original = ports.folders.reopen.bind(ports.folders)
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    vi.spyOn(ports.folders, 'reopen').mockImplementation(async (id) => {
      await gate
      return original(id)
    })
    const bar = createMemoryAddressBar()
    const { result } = renderNavigation(ports, bar)
    await editorOf(result)
    await waitFor(() => expect(bar.hash()).toBe(FIRST_ADDRESS))
    await act(settle)
    await visit(bar, addressOf(FOLDER_ID))
    await pageOf(result)

    act(() => result.current.retry())
    await act(settle)
    act(() => result.current.retry())
    await act(settle)
    await visit(bar, PROJECTS_ADDRESS)
    await act(settle)
    await act(async () => release())

    await waitFor(() => expect(openId(result)).toBe(FOLDER_ID))
    await act(settle)
    expect(result.current.screen).toStrictEqual({ kind: 'projects' })
    expect(bar.entries()).toEqual([FIRST_ADDRESS, addressOf(FOLDER_ID), PROJECTS_ADDRESS])
  })
})
