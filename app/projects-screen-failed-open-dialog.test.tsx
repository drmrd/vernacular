import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DID_NOT_OPEN } from '../editor/projects'
import { formatFaultsOf, withMixedPaintEntries } from '../core/repairs/repairs-test-kit'
import { TEST_BUILD, failSaves } from '../session/handle/handle-test-kit'
import {
  FAILED_ID,
  expectOpenProject,
  clickCardOf,
  filesUnder,
  findCardLink,
  findThePageAlert,
  findTheProjectsPage,
  renderApp,
  renderAppAt,
  settleForAWhile,
} from './app-test-support'
import { recordDownloads } from './card-actions-test-support'
import {
  NEWER_VERSION_CAUSE,
  clickInTheDialog,
  findTheFailedOpenDialog,
  openTheDialogFromTheCard,
  portsWhoseLatestProjectDoesNotOpen,
  portsWithARepairableProject,
} from './failed-open-dialog-test-support'
import {
  FIRST_ID,
  PROJECTS_ADDRESS,
  SECOND_ID,
  addressOf,
  durablePortsWith,
  nameOf,
} from './history-navigation-test-support'
import {
  addAFloor,
  findTheCardThatDidNotOpen,
  openFirstProject,
  portsWithAProjectThatDoesNotOpen,
  setUpProjectsScreenTests,
  showThePageOn,
} from './projects-screen-test-support'

const PAGE_SENTENCE = /Could not open the project/
const SAVE_FAILED_SENTENCE = 'The changes could not be saved, so the project stays open.'
const KEPT_UNCHANGED = 'The stored file is kept unchanged.'
const UNCHECKED_SUFFIX = /-unchecked-copy\.building$/
const STORAGE_CAUSE = 'The storage did not answer.'

setUpProjectsScreenTests()
const downloads = recordDownloads()

describe('The failed-open dialog on the Projects page', () => {
  it('shows the dialog at the start when the most recent project did not open', async () => {
    renderApp(await portsWhoseLatestProjectDoesNotOpen())

    const dialog = await findTheFailedOpenDialog()

    expect(dialog).toHaveTextContent(NEWER_VERSION_CAUSE)
    expect(dialog).toHaveTextContent(KEPT_UNCHANGED)
  })

  it('shows the dialog after a click on a card whose project does not open', async () => {
    const ports = await portsWithAProjectThatDoesNotOpen()
    const { bar } = renderAppAt(ports, PROJECTS_ADDRESS)

    await userEvent.click(await findTheCardThatDidNotOpen())

    expect(await findTheFailedOpenDialog()).toHaveTextContent(NEWER_VERSION_CAUSE)
    expect(bar.hash()).toBe(PROJECTS_ADDRESS)
  })

  it('shows the dialog at an address that names a project that does not open', async () => {
    renderAppAt(await portsWhoseLatestProjectDoesNotOpen(), addressOf(FAILED_ID))

    expect(await findTheFailedOpenDialog()).toHaveTextContent(NEWER_VERSION_CAUSE)
  })

  it('shows no page notice beside the dialog', async () => {
    renderApp(await portsWhoseLatestProjectDoesNotOpen())

    await findTheFailedOpenDialog()
    await settleForAWhile()

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(PAGE_SENTENCE)).not.toBeInTheDocument()
  })

  it('Close returns to the page, and the card still says that the project did not open', async () => {
    const ports = await portsWithAProjectThatDoesNotOpen()
    const filesBefore = await filesUnder(ports.root, FAILED_ID)
    const { dialog } = await openTheDialogFromTheCard(ports)

    await clickInTheDialog(dialog, 'Close')

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(await findTheCardThatDidNotOpen()).toHaveTextContent(DID_NOT_OPEN)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(filesBefore.size).toBeGreaterThan(0)
    expect(await filesUnder(ports.root, FAILED_ID)).toEqual(filesBefore)
  })

  it('Escape closes the dialog like Close does, and changes no stored file', async () => {
    const ports = await portsWithAProjectThatDoesNotOpen()
    const filesBefore = await filesUnder(ports.root, FAILED_ID)
    await openTheDialogFromTheCard(ports)

    await userEvent.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(await findTheProjectsPage()).toBeInTheDocument()
    expect(await filesUnder(ports.root, FAILED_ID)).toEqual(filesBefore)
  })

  it('Export in the dialog gives the unchecked copy', async () => {
    const { dialog } = await openTheDialogFromTheCard(await portsWithAProjectThatDoesNotOpen())

    await clickInTheDialog(dialog, 'Export')

    await waitFor(() => expect(downloads.fileNames).toHaveLength(1))
    expect(downloads.fileNames[0]).toMatch(UNCHECKED_SUFFIX)
  })

  it('shows "Try again" when the storage did not answer, and a try that works opens the project', async () => {
    const ports = await durablePortsWith(FIRST_ID)
    vi.spyOn(ports.workspace, 'read').mockRejectedValueOnce(new Error('disk fault'))
    renderAppAt(ports, PROJECTS_ADDRESS)
    await userEvent.click(await within(await findTheProjectsPage()).findByRole('link'))
    const dialog = await findTheFailedOpenDialog()
    expect(dialog).toHaveTextContent(STORAGE_CAUSE)

    await clickInTheDialog(dialog, 'Try again')

    await expectOpenProject(nameOf(FIRST_ID))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('the details name the build and the faults of the project', async () => {
    const ports = await portsWithARepairableProject()
    const faults = formatFaultsOf(withMixedPaintEntries())
    const { dialog } = await openTheDialogFromTheCard(ports)

    const details = within(dialog).getByText('Technical details').closest('details')

    expect(details).not.toBeNull()
    expect(details).toHaveTextContent(TEST_BUILD)
    expect(faults.length).toBeGreaterThan(0)
    for (const fault of faults) expect(details).toHaveTextContent(fault.path)
  })

  it('a switch that cannot save the open project keeps the page sentence and shows no dialog', async () => {
    const { ports, bar } = await openFirstProject()
    await addAFloor()
    failSaves(ports.workspace)
    await showThePageOn(bar)

    await clickCardOf(nameOf(SECOND_ID))

    expect(await findThePageAlert()).toHaveTextContent(SAVE_FAILED_SENTENCE)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('a project that another tab holds keeps its line on the card and shows no dialog', async () => {
    const ports = await durablePortsWith(FIRST_ID)
    renderAppAt(ports, PROJECTS_ADDRESS)
    const card = await findCardLink(nameOf(FIRST_ID))
    ports.lockRegistry.add(FIRST_ID)

    await userEvent.click(card)
    await settleForAWhile()

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(await findTheProjectsPage()).toBeInTheDocument()
  })
})
