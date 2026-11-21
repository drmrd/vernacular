import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, vi } from 'vitest'
import { reconcileIndex } from '../session'
import { changeRecord, putInPool } from '../session/flows/delete-project-test-kit'
import type { TestPorts } from '../session/handle/handle-test-kit'
import { contentHashOf } from '../storage/zip/zip-test-kit'
import { FAILED_ID, documentBytes, namedProject, plantFailedProject } from './app-test-support'
import { FIRST_ID, SECOND_ID, durablePortsWith } from './history-navigation-test-support'
import {
  FOLDER_NAME,
  chooseAnActionOf,
  findTheCardThatDidNotOpen,
  listFolderProject,
  openTheMenuOf,
} from './projects-screen-test-support'

/** Test support: the steps of the actions of a card on the Projects page that the tests share. */

/** The field of the rename form that shows on a card, or null when no form shows. */
export function theRenameField(): HTMLElement | null {
  return screen.queryByRole('textbox', { name: 'Project name' })
}

/** Opens the rename form of the card of `name`, replaces the name with `newName`, and saves it. */
export async function renameFromTheCard(name: string, newName: string): Promise<void> {
  await chooseAnActionOf(name, 'Rename')
  const field = await screen.findByRole('textbox', { name: 'Project name' })
  await userEvent.clear(field)
  await userEvent.type(field, newName)
  await userEvent.click(screen.getByRole('button', { name: 'Save name' }))
}

/** The files that the application handed to the download, and the bytes it handed over. */
export interface RecordedDownloads {
  readonly fileNames: string[]
  readonly blobs: Blob[]
}

/**
 * Registers, for each test of the surrounding describe, a stand-in for the browser's download: the
 * file name and the content of each download are recorded and no file is made. jsdom has neither
 * the object URL methods nor the navigation that a click on the download link starts.
 */
export function recordDownloads(): RecordedDownloads {
  const downloads: RecordedDownloads = { fileNames: [], blobs: [] }
  const createObjectUrl = URL.createObjectURL
  const revokeObjectUrl = URL.revokeObjectURL
  beforeEach(() => {
    downloads.fileNames.length = 0
    downloads.blobs.length = 0
    URL.createObjectURL = vi.fn((blob: Blob) => {
      downloads.blobs.push(blob)
      return 'blob:recorded'
    })
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      if (this.download !== '') downloads.fileNames.push(this.download)
    })
  })
  afterEach(() => {
    URL.createObjectURL = createObjectUrl
    URL.revokeObjectURL = revokeObjectUrl
  })
  return downloads
}

/**
 * Durable ports with an ordinary project, a project that another tab holds, a project that did not
 * open, and a project that a folder holds.
 */
export async function portsWithCardsOfEveryKind(): Promise<TestPorts> {
  const ports = await durablePortsWith(FIRST_ID, SECOND_ID)
  await plantFailedProject(ports)
  await reconcileIndex(ports)
  await listFolderProject(ports, documentBytes(namedProject(FOLDER_NAME)))
  ports.lockRegistry.add(SECOND_ID)
  return ports
}

/** Opens the "..." menu of the card whose project did not open. */
export async function openTheMenuOfTheCardThatDidNotOpen(): Promise<void> {
  const card = (await findTheCardThatDidNotOpen()).closest('li')
  if (card === null) throw new Error('The card that did not open is not in a list item')
  await userEvent.click(within(card).getByRole('button', { name: /^Actions for / }))
}

/** Opens the menu of the card whose project did not open, and chooses Export. */
export async function exportTheCardThatDidNotOpen(): Promise<void> {
  await openTheMenuOfTheCardThatDidNotOpen()
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Export' }))
}

/**
 * Gives the project that did not open an asset: the pool holds its bytes and its record lists it.
 * Call it once the card shows, so that no later read of the cards writes the record again.
 */
export async function giveTheProjectThatDidNotOpenAnAsset(ports: TestPorts): Promise<void> {
  const bytes = new TextEncoder().encode('the bytes of an image that the project used')
  const hash = await contentHashOf(bytes)
  await ports.workspace.assets(FAILED_ID).put(hash, bytes)
  const record = await ports.index.get(FAILED_ID)
  if (record === undefined) throw new Error('The project that did not open has no record')
  await ports.index.put({ ...record, assetHashes: [hash] })
}

/** Chooses Delete on the card of `name`, then presses the button `answer` of the dialog that asks. */
export async function chooseDeleteAndAnswer(
  name: string,
  answer: 'Cancel' | 'Delete project',
): Promise<void> {
  await chooseAnActionOf(name, 'Delete')
  const dialog = await screen.findByRole('alertdialog', { name: `Delete "${name}"?` })
  await userEvent.click(within(dialog).getByRole('button', { name: answer }))
}

/** The names of the entries in the "..." menu of the card of `name`, in order. The menu is closed after. */
export async function menuEntriesOf(name: string): Promise<Array<string | null>> {
  await openTheMenuOf(name)
  const entries = (await screen.findAllByRole('menuitem')).map((item) => item.textContent)
  await userEvent.keyboard('{Escape}')
  return entries
}

/** The link back to the open project, or null when the page shows none. */
export function theLinkBack(): HTMLElement | null {
  return screen.queryByRole('button', { name: /^Back to / })
}

/**
 * Puts an asset into the pool that only the project `id` lists. Gives its content hash. Call it once
 * the card shows, so that no later read of the cards writes the record again.
 */
export async function givePoolAssetTo(ports: TestPorts, id: string): Promise<string> {
  const hash = await putInPool(ports, `the asset that only ${id} uses`)
  await changeRecord(ports, id, { assetHashes: [hash] })
  return hash
}
