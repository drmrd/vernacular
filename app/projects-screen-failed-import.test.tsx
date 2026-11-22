import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ARCHIVE_LIMITS } from '../storage'
import { REPAIRED_NAME, mixedPaintBytes } from '../session/flows/open-failed-test-kit'
import type { TestPorts } from '../session/handle/handle-test-kit'
import { buildZip, documentEntry } from '../storage/zip/zip-test-kit'
import { unreadableFile } from './action-test-support'
import {
  expectOpenProject,
  findCardLink,
  projectFromANewerBuild,
  recordIds,
  renderAppAt,
  settleForAWhile,
  storedIds,
  type RenderedApp,
} from './app-test-support'
import {
  CHOICE_TITLE,
  FILE_TITLE,
  PAINT_REPAIR_SENTENCE,
  STORED_TITLE,
  clickInTheDialog,
  findTheChoiceDialog,
  findTheFailedOpenDialog,
} from './failed-open-dialog-test-support'
import {
  FIRST_ID,
  PROJECTS_ADDRESS,
  durablePortsWith,
  nameOf,
} from './history-navigation-test-support'
import { TOO_LARGE_SENTENCE } from './open-file-action-test-support'
import {
  chooseInThePicker,
  clickPageAction,
  dropOnThePage,
  setUpProjectsScreenTests,
} from './projects-screen-test-support'

const LIMIT_SENTENCE = 'The file is larger than Vernacular can open.'
const LIMIT_DETAIL = TOO_LARGE_SENTENCE.replace(/^Open failed: /, '')
const DOCUMENT_LIMIT_DETAIL = /The project document in the file is larger than/
const FORMAT_RULES_CAUSE = 'A part of the project breaks the format rules.'
const NEWER_VERSION_CAUSE = 'A newer version of Vernacular made this project.'
const NOT_A_PROJECT_CAUSE = 'The file is not a Vernacular project.'
const FILE_CHOICE_SENTENCE =
  'A new file stores a repaired version of this project. The file that you chose stays unchanged.'
const GARBAGE_SIZE = 1

setUpProjectsScreenTests()

/** A `.json` file that holds the project that breaks the format rules and that a repair fixes. */
function repairableFile(): File {
  return new File([mixedPaintBytes().buffer as ArrayBuffer], 'house.json')
}

/** A `.building` archive whose project document declares a size above the limit of a document. */
function archiveOverTheDocumentLimit(): File {
  const content = new Uint8Array(GARBAGE_SIZE)
  const declaredBytes = ARCHIVE_LIMITS.documentBytes + 1
  const bytes = buildZip([documentEntry(content, { data: content, declaredBytes })])
  return new File([bytes.buffer as ArrayBuffer], 'house.building')
}

/** Renders the Projects page over a project that opens, and imports `file` from the picker. */
async function importFromThePicker(file: File): Promise<{ ports: TestPorts } & RenderedApp> {
  const ports = await durablePortsWith(FIRST_ID)
  const rendered = renderAppAt(ports, PROJECTS_ADDRESS)
  await findCardLink(nameOf(FIRST_ID))
  chooseInThePicker(file)
  await clickPageAction('Import file')
  return { ports, ...rendered }
}

describe('A file that does not import, on the Projects page', () => {
  it('a file that breaks the format rules shows the dialog with the texts of a file', async () => {
    await importFromThePicker(repairableFile())

    const dialog = await findTheFailedOpenDialog(FILE_TITLE)

    expect(dialog).toHaveTextContent(FORMAT_RULES_CAUSE)
    expect(dialog).toHaveTextContent(PAINT_REPAIR_SENTENCE)
    expect(dialog).not.toHaveTextContent('kept unchanged')
    expect(screen.queryByRole('alertdialog', { name: STORED_TITLE })).not.toBeInTheDocument()
    expect(screen.queryByText(/^Open failed/)).not.toBeInTheDocument()
  })

  it('the dialog of a file has no Export', async () => {
    await importFromThePicker(repairableFile())

    const dialog = await findTheFailedOpenDialog(FILE_TITLE)

    expect(dialog).not.toHaveTextContent('export')
    expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument()
  })

  it('with an offer, the choice has no replace control', async () => {
    await importFromThePicker(repairableFile())
    await clickInTheDialog(await findTheFailedOpenDialog(FILE_TITLE), 'Open with the repair')

    const choice = await findTheChoiceDialog()

    expect(choice).toHaveTextContent(FILE_CHOICE_SENTENCE)
    expect(screen.queryByRole('button', { name: 'Replace the stored project' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Open as a new project' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('"Open as a new project" opens the repaired copy of the file', async () => {
    const { ports } = await importFromThePicker(repairableFile())
    await clickInTheDialog(await findTheFailedOpenDialog(FILE_TITLE), 'Open with the repair')

    await clickInTheDialog(await findTheChoiceDialog(), 'Open as a new project')

    await expectOpenProject(REPAIRED_NAME)
    expect(await storedIds(ports)).toHaveLength(2)
    expect(screen.queryByRole('alertdialog', { name: CHOICE_TITLE })).not.toBeInTheDocument()
  })

  it('an archive over a limit says "The file is larger than Vernacular can open."', async () => {
    await importFromThePicker(archiveOverTheDocumentLimit())

    expect(await findTheFailedOpenDialog(FILE_TITLE)).toHaveTextContent(LIMIT_SENTENCE)
  })

  it('a file over the size limit says the same sentence before it is read', async () => {
    const { file, reads } = unreadableFile({ size: ARCHIVE_LIMITS.archiveBytes + 1 })
    await importFromThePicker(file)

    expect(await findTheFailedOpenDialog(FILE_TITLE)).toHaveTextContent(LIMIT_SENTENCE)
    expect(reads()).toBe(0)
  })

  it('the details of a file over a limit name the limit', async () => {
    await importFromThePicker(archiveOverTheDocumentLimit())
    const dialog = await findTheFailedOpenDialog(FILE_TITLE)

    const details = dialog.querySelector('details')

    expect(details).toHaveTextContent(DOCUMENT_LIMIT_DETAIL)
  })

  it('the details of a file over the size limit name that limit', async () => {
    await importFromThePicker(unreadableFile({ size: ARCHIVE_LIMITS.archiveBytes + 1 }).file)
    const dialog = await findTheFailedOpenDialog(FILE_TITLE)

    expect(dialog.querySelector('details')).toHaveTextContent(LIMIT_DETAIL)
  })

  it('a file that is not a Vernacular project says so', async () => {
    await importFromThePicker(new File(['not a project'], 'broken.building'))

    expect(await findTheFailedOpenDialog(FILE_TITLE)).toHaveTextContent(NOT_A_PROJECT_CAUSE)
  })

  it('a file of a newer version says so', async () => {
    const bytes = projectFromANewerBuild().buffer as ArrayBuffer
    await importFromThePicker(new File([bytes], 'newer.json'))

    expect(await findTheFailedOpenDialog(FILE_TITLE)).toHaveTextContent(NEWER_VERSION_CAUSE)
  })
})

describe('A file that the page cannot import at all, or that is closed again', () => {
  it('an unsupported file type keeps its notice and shows no dialog', async () => {
    await importFromThePicker(new File(['{}'], 'house.zip'))

    expect(await screen.findByText(/Unsupported project file: house\.zip/)).toBeInTheDocument()
    await settleForAWhile()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('Close returns to the page, and nothing is stored', async () => {
    const { ports } = await importFromThePicker(repairableFile())
    const idsBefore = await storedIds(ports)
    const recordsBefore = await recordIds(ports)

    await clickInTheDialog(await findTheFailedOpenDialog(FILE_TITLE), 'Close')

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(await findCardLink(nameOf(FIRST_ID))).toBeInTheDocument()
    expect(await storedIds(ports)).toEqual(idsBefore)
    expect(await recordIds(ports)).toEqual(recordsBefore)
  })

  it('a file dropped on the page shows the same dialog', async () => {
    const ports = await durablePortsWith(FIRST_ID)
    renderAppAt(ports, PROJECTS_ADDRESS)
    await findCardLink(nameOf(FIRST_ID))

    await dropOnThePage(repairableFile())

    expect(await findTheFailedOpenDialog(FILE_TITLE)).toHaveTextContent(FORMAT_RULES_CAUSE)
  })
})
