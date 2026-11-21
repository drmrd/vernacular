import { act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rememberFolder } from '../session/handle/handle-test-kit'
import { documentNamed, folderRecord } from '../session/projects/rebuild-test-kit'
import { createMemoryAddressBar } from './address-bar'
import { plantProject } from './app-test-support'
import {
  FIRST_ADDRESS,
  FIRST_ID,
  FOLDER_ID,
  FOLDER_NAME,
  MISSING_ADDRESS,
  MISSING_ID,
  NOT_FOUND,
  addressOf,
  atTheFirstProject,
  durablePortsWith,
  editorOf,
  nameOf,
  openId,
  pageOf,
  renderNavigation,
  visit,
} from './history-navigation-test-support'

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
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
