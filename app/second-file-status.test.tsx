import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import {
  editTheProject,
  expectOpenProject,
  renderApp,
  resetWindowAddress,
  stubCapableStorage,
} from './app-test-support'
import {
  SECOND_FILE_PROJECT_NAME,
  portsWithTheProjectInASecondFile,
  waitForAnyStoredStatus,
  waitForTheStatus,
} from './second-file-test-support'

const SECOND_FILE_STATUS = 'Saved in a second plan file'

afterEach(() => {
  cleanup()
  resetWindowAddress()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Dispatches a cancelable `beforeunload` event on the window, and says whether the application vetoed it. */
function leaveIsPrevented(): boolean {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

/** Opens the project that lives in a second file and edits it once. */
async function openAndEditTheProject(): Promise<void> {
  stubCapableStorage()
  renderApp(await portsWithTheProjectInASecondFile())
  await expectOpenProject(SECOND_FILE_PROJECT_NAME)
  await editTheProject()
}

describe('The editor of a project that is saved in a second plan file', () => {
  it('reads that the project is saved in a second plan file, and never that all changes are saved', async () => {
    await openAndEditTheProject()

    await waitForTheStatus(SECOND_FILE_STATUS)

    expect(screen.queryByText(/all changes saved/i)).not.toBeInTheDocument()
  })

  it('lets the tab close once the changes are stored, in durable storage', async () => {
    await openAndEditTheProject()

    await waitForAnyStoredStatus()

    expect(leaveIsPrevented()).toBe(false)
  })
})
