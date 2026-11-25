import { waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { storedProject } from '../session/handle/handle-test-kit'
import {
  AUTOSAVE_TIMEOUT_MS,
  backToTheProject,
  clickCardOf,
  expectOpenProject,
  findCardLink,
  findTheProjectsPage,
  renderAppAt,
  settleForAWhile,
} from './app-test-support'
import { findTheFailedOpenDialog } from './failed-open-dialog-test-support'
import { FIRST_ID, PROJECTS_ADDRESS, nameOf } from './history-navigation-test-support'
import {
  FOLDER_ID,
  FOLDER_NAME,
  NEEDS_PERMISSION_LINE,
  addAFloor,
  expectTheEditAndUndoIt,
  openFirstProjectOn,
  portsWithAFolderProject,
  setUpProjectsScreenTests,
  showThePageOn,
  textOfTheCards,
} from './projects-screen-test-support'

const FOLDER_UNAVAILABLE_CAUSE = 'The folder is not available.'

setUpProjectsScreenTests()

describe('The card of a folder project that needs the permission again', () => {
  it('asks the folder access inside the click, before the lock, and opens the project when it grants', async () => {
    const ports = await portsWithAFolderProject()
    ports.folders.setPermission(FOLDER_ID, 'prompt')
    const reopen = vi.spyOn(ports.folders, 'reopen')
    const tryAcquire = vi.spyOn(ports.locks, 'tryAcquire')
    renderAppAt(ports, PROJECTS_ADDRESS)

    await clickCardOf(FOLDER_NAME)

    await expectOpenProject(FOLDER_NAME)
    expect(reopen).toHaveBeenCalled()
    for (const call of reopen.mock.calls) expect(call).toEqual([FOLDER_ID])
    const lockForTheFolder = tryAcquire.mock.calls.findIndex(([id]) => id === FOLDER_ID)
    expect(lockForTheFolder).toBeGreaterThanOrEqual(0)
    expect(reopen.mock.invocationCallOrder[0]).toBeLessThan(
      tryAcquire.mock.invocationCallOrder[lockForTheFolder] ?? 0,
    )
  })

  it('changes nothing, over an open project, when the browser refuses the permission', async () => {
    const ports = await portsWithAFolderProject()
    ports.folders.setPermission(FOLDER_ID, 'prompt')
    const { bar } = await openFirstProjectOn(ports)
    await addAFloor()
    await waitFor(
      async () => expect((await storedProject(ports.workspace, FIRST_ID)).floors).toHaveLength(2),
      { timeout: AUTOSAVE_TIMEOUT_MS },
    )
    await showThePageOn(bar)
    await findCardLink(FOLDER_NAME)
    const cardsBefore = await textOfTheCards()
    const recordBefore = await ports.index.get(FOLDER_ID)
    const reopen = vi.spyOn(ports.folders, 'reopen').mockResolvedValue('denied')

    await clickCardOf(FOLDER_NAME)
    await waitFor(() => expect(reopen).toHaveBeenCalledTimes(1))
    await settleForAWhile()

    expect(await findTheProjectsPage()).toBeInTheDocument()
    expect(bar.hash()).toBe(PROJECTS_ADDRESS)
    expect(await textOfTheCards()).toEqual(cardsBefore)
    expect(await findCardLink(FOLDER_NAME)).toHaveTextContent(NEEDS_PERMISSION_LINE)
    expect(await ports.index.get(FOLDER_ID)).toEqual(recordBefore)
    await backToTheProject(nameOf(FIRST_ID))
    await expectTheEditAndUndoIt()
  })
})

describe('The card of a folder project whose folder handle is gone', () => {
  it('says that the folder cannot be reached when it is clicked', async () => {
    const ports = await portsWithAFolderProject()
    await ports.folders.forget(FOLDER_ID)
    renderAppAt(ports, PROJECTS_ADDRESS)

    await clickCardOf(FOLDER_NAME)

    expect(await findTheFailedOpenDialog()).toHaveTextContent(FOLDER_UNAVAILABLE_CAUSE)
    expect(await findTheProjectsPage()).toBeInTheDocument()
  })
})
