import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION } from '../core'
import { PROJECT_ID } from '../session/flows/open-failed-test-kit'
import { folderRecord, notJsonBytes } from '../session/projects/rebuild-test-kit'
import {
  bytesOf,
  fixtureDocument,
  metaOf,
} from '../tests/fixtures/projects/versions/fixture-documents'
import {
  clickCardOf,
  findCardLink,
  findThePageAlert,
  renderApp,
  renderAppAt,
  settleForAWhile,
  usedLast,
} from './app-test-support'
import {
  findTheFailedOpenDialog,
  openTheDialogFromTheCard,
  portsWhoseLatestProjectDoesNotOpen,
  portsWithARepairableProject,
} from './failed-open-dialog-test-support'
import {
  FIRST_ID,
  SECOND_ID,
  PROJECTS_ADDRESS,
  addressOf,
  durablePortsWith,
  nameOf,
} from './history-navigation-test-support'
import { NOT_STORED } from './open-failure-text'
import { FOLDER_ID, FOLDER_NAME, setUpProjectsScreenTests } from './projects-screen-test-support'

const MIGRATION_FAILED_CAUSE = 'Vernacular could not bring this project up to the current format.'
const FOLDER_CAUSE = 'The folder is not available.'
const NOT_A_PROJECT_CAUSE = 'The stored file is not a Vernacular project.'
const VERSION_BELOW_ALL_STEPS = 0

setUpProjectsScreenTests()

/** The details box of `dialog`, which its summary "Technical details" opens. */
function detailsOf(dialog: HTMLElement): HTMLElement | null {
  return within(dialog).getByText('Technical details').closest('details')
}

/** A document of the current version that declares a version which no migration starts from. */
function documentOfAVersionWithNoMigration(): Uint8Array {
  const document = fixtureDocument(CURRENT_SCHEMA_VERSION)
  metaOf(document).schemaVersion = VERSION_BELOW_ALL_STEPS
  return bytesOf(document)
}

describe('The details and the causes of the failed-open dialog on the Projects page', () => {
  it('the details give the version of a project that a newer build wrote', async () => {
    renderApp(await portsWhoseLatestProjectDoesNotOpen())

    const details = detailsOf(await findTheFailedOpenDialog())

    expect(details).toHaveTextContent(
      new RegExp(`Format version\\s*${CURRENT_SCHEMA_VERSION + 1}(?!\\d)`),
    )
  })

  it('the details give the current version for a project that breaks the format rules', async () => {
    const { dialog } = await openTheDialogFromTheCard(await portsWithARepairableProject())

    expect(detailsOf(dialog)).toHaveTextContent(
      new RegExp(`Format version\\s*${CURRENT_SCHEMA_VERSION}(?!\\d)`),
    )
  })

  it('says that Vernacular could not bring the project up to the current format, and the version it started from', async () => {
    const ports = await portsWithARepairableProject(documentOfAVersionWithNoMigration())
    renderAppAt(ports, addressOf(PROJECT_ID))

    const dialog = await findTheFailedOpenDialog()

    expect(dialog).toHaveTextContent(MIGRATION_FAILED_CAUSE)
    expect(detailsOf(dialog)).toHaveTextContent(
      new RegExp(`Format version\\s*${VERSION_BELOW_ALL_STEPS}(?!\\d)`),
    )
  })

  it('says that the folder is not available when the browser no longer remembers it', async () => {
    const ports = await durablePortsWith(FIRST_ID)
    await ports.index.put(folderRecord(FOLDER_ID, { name: FOLDER_NAME }))
    await usedLast(ports, FOLDER_ID)
    renderAppAt(ports, addressOf(FOLDER_ID))

    expect(await findTheFailedOpenDialog()).toHaveTextContent(FOLDER_CAUSE)
  })

  it('says that the stored file is not a Vernacular project when it is not JSON', async () => {
    const ports = await portsWithARepairableProject(notJsonBytes())
    renderAppAt(ports, addressOf(PROJECT_ID))

    expect(await findTheFailedOpenDialog()).toHaveTextContent(NOT_A_PROJECT_CAUSE)
  })

  it('a card whose project is not stored keeps the sentence of the page and shows no dialog', async () => {
    const ports = await durablePortsWith(FIRST_ID, SECOND_ID)
    renderAppAt(ports, PROJECTS_ADDRESS)
    await findCardLink(nameOf(SECOND_ID))
    await ports.workspace.delete(SECOND_ID)

    await clickCardOf(nameOf(SECOND_ID))
    await settleForAWhile()

    expect(await findThePageAlert()).toHaveTextContent(NOT_STORED)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})
