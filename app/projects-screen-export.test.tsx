import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { bundleFilename } from '../storage'
import { contentHashOf, projectReferring } from '../storage/zip/zip-test-kit'
import { findCardLink, findTheProjectsPage, renderAppAt } from './app-test-support'
import {
  exportTheCardThatDidNotOpen,
  giveTheProjectThatDidNotOpenAnAsset,
  openTheMenuOfTheCardThatDidNotOpen,
  portsWithCardsOfEveryKind,
  recordDownloads,
} from './card-actions-test-support'
import {
  FIRST_ID,
  PROJECTS_ADDRESS,
  SECOND_ID,
  durablePortsWith,
  nameOf,
} from './history-navigation-test-support'
import {
  FOLDER_NAME,
  OTHER_TAB_LINE,
  chooseAnActionOf,
  findTheCardThatDidNotOpen,
  openTheMenuOf,
  portsWithAProjectThatDoesNotOpen,
  setUpProjectsScreenTests,
} from './projects-screen-test-support'

const UNCHECKED_SUFFIX = /-unchecked-copy\.building$/
const NOT_CHECKED_SENTENCE = 'This copy was not checked, because the project did not open.'
const NO_ASSETS_SENTENCE = `${NOT_CHECKED_SENTENCE} It has the project file only, and no assets.`
const NOT_STORED_SENTENCE = 'This project is not stored in this browser.'
const ONE_ASSET_LEFT_OUT_SENTENCE =
  'The export does not include 1 asset, because this browser does not have it.'
const LOST_ASSET = new TextEncoder().encode('the bytes of an asset that this browser lost')

/** The name that the card of the project that did not open shows, from the label of its menu button. */
async function shownNameOfTheCardThatDidNotOpen(): Promise<string> {
  const item = (await findTheCardThatDidNotOpen()).closest('li')
  if (item === null) throw new Error('The card that did not open is not in a list item')
  const label = within(item)
    .getByRole('button', { name: /^Actions for / })
    .getAttribute('aria-label')
  return (label ?? '').replace(/^Actions for /, '')
}

setUpProjectsScreenTests()
const downloads = recordDownloads()

describe('Export on the cards of the Projects page', () => {
  it.each([
    ['an ordinary card', () => openTheMenuOf(nameOf(FIRST_ID))],
    ['a card of a project that another tab holds', () => openTheMenuOf(nameOf(SECOND_ID))],
    ['a card of a project that did not open', () => openTheMenuOfTheCardThatDidNotOpen()],
    ['a card of a project that a folder holds', () => openTheMenuOf(FOLDER_NAME)],
  ])('offers Export on %s', async (_kind, openTheMenu) => {
    renderAppAt(await portsWithCardsOfEveryKind(), PROJECTS_ADDRESS)
    await findTheCardThatDidNotOpen()

    await openTheMenu()

    expect(await screen.findByRole('menuitem', { name: 'Export' })).toBeInTheDocument()
  })

  it('hands an archive named for the project to the download and shows that it exported', async () => {
    renderAppAt(await durablePortsWith(FIRST_ID, SECOND_ID), PROJECTS_ADDRESS)
    await findCardLink(nameOf(FIRST_ID))

    await chooseAnActionOf(nameOf(FIRST_ID), 'Export')

    expect(
      await screen.findByText(`Exported ${bundleFilename(nameOf(FIRST_ID))}`),
    ).toBeInTheDocument()
    expect(downloads.fileNames).toEqual([bundleFilename(nameOf(FIRST_ID))])
    expect(downloads.fileNames[0]).not.toMatch(UNCHECKED_SUFFIX)
    expect(downloads.blobs[0]?.size).toBeGreaterThan(0)
  })

  it('warns that the archive of a project leaves out the asset that this browser lacks', async () => {
    const ports = await durablePortsWith(FIRST_ID, SECOND_ID)
    const lost = projectReferring([{ scope: 'user', contentHash: await contentHashOf(LOST_ASSET) }])
    await ports.workspace.save(FIRST_ID, {
      ...lost,
      meta: { ...lost.meta, name: nameOf(FIRST_ID) },
    })
    renderAppAt(ports, PROJECTS_ADDRESS)
    await findCardLink(nameOf(FIRST_ID))

    await chooseAnActionOf(nameOf(FIRST_ID), 'Export')

    expect(await screen.findByText(ONE_ASSET_LEFT_OUT_SENTENCE)).toBeInTheDocument()
    expect(downloads.fileNames).toEqual([bundleFilename(nameOf(FIRST_ID))])
  })

  it('warns that the copy of a project that did not open was not checked', async () => {
    const ports = await portsWithAProjectThatDoesNotOpen()
    renderAppAt(ports, PROJECTS_ADDRESS)
    await findTheCardThatDidNotOpen()
    await giveTheProjectThatDidNotOpenAnAsset(ports)

    await exportTheCardThatDidNotOpen()

    expect(await screen.findByText(NOT_CHECKED_SENTENCE)).toBeInTheDocument()
  })

  it('says in the same warning that the copy holds the project file only when it holds no asset', async () => {
    renderAppAt(await portsWithAProjectThatDoesNotOpen(), PROJECTS_ADDRESS)
    await findTheCardThatDidNotOpen()

    await exportTheCardThatDidNotOpen()

    expect(await screen.findByText(NO_ASSETS_SENTENCE)).toBeInTheDocument()
  })

  it('hands the copy of a project that did not open to the download under a name that ends in -unchecked-copy.building', async () => {
    renderAppAt(await portsWithAProjectThatDoesNotOpen(), PROJECTS_ADDRESS)
    const shownName = await shownNameOfTheCardThatDidNotOpen()
    const fileName = bundleFilename(`${shownName} unchecked copy`)

    await exportTheCardThatDidNotOpen()

    await waitFor(() => expect(downloads.fileNames).toEqual([fileName]))
    expect(fileName).toMatch(UNCHECKED_SUFFIX)
    expect(await screen.findByText(`Exported ${fileName}`)).toBeInTheDocument()
  })

  it('shows the reason with Retry in a toast, and leaves the alert of the page empty, when the export fails', async () => {
    const ports = await durablePortsWith(FIRST_ID, SECOND_ID)
    renderAppAt(ports, PROJECTS_ADDRESS)
    await findCardLink(nameOf(SECOND_ID))
    await ports.workspace.delete(SECOND_ID)

    await chooseAnActionOf(nameOf(SECOND_ID), 'Export')

    expect(await screen.findByText(`Export failed: ${NOT_STORED_SENTENCE}`)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(within(await findTheProjectsPage()).queryByRole('alert')).toBeNull()
    expect(downloads.fileNames).toEqual([])
  })

  it('exports a project that another tab holds, and leaves its card and its lock as they were', async () => {
    const ports = await durablePortsWith(FIRST_ID, SECOND_ID)
    ports.lockRegistry.add(SECOND_ID)
    renderAppAt(ports, PROJECTS_ADDRESS)
    expect(await findCardLink(nameOf(SECOND_ID))).toHaveTextContent(OTHER_TAB_LINE)

    await chooseAnActionOf(nameOf(SECOND_ID), 'Export')

    expect(
      await screen.findByText(`Exported ${bundleFilename(nameOf(SECOND_ID))}`),
    ).toBeInTheDocument()
    expect(downloads.fileNames).toEqual([bundleFilename(nameOf(SECOND_ID))])
    expect(await findCardLink(nameOf(SECOND_ID))).toHaveTextContent(OTHER_TAB_LINE)
    expect([...ports.lockRegistry]).toEqual([SECOND_ID])
  })
})
