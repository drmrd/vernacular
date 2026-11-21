import { screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { poolHashes } from '../session/flows/delete-project-test-kit'
import { DOCUMENT_FILE, failSaves } from '../session/handle/handle-test-kit'
import { treeOf } from '../storage/documents/document-store-test-kit'
import type { LibraryItem } from '../storage'
import { projectOf } from '../tests/fixtures/projects/versions/fixture-documents'
import { furnitureItem } from './action-test-support'
import {
  clickCardOf,
  documentBytes,
  expectOpenProject,
  findCardLink,
  findThePageAlert,
  namedProject,
  renderAppAt,
  settleForAWhile,
  storedIds,
} from './app-test-support'
import {
  chooseDeleteAndAnswer,
  givePoolAssetTo,
  menuEntriesOf,
  portsWithCardsOfEveryKind,
  theLinkBack,
} from './card-actions-test-support'
import {
  FIRST_ID,
  PROJECTS_ADDRESS,
  SECOND_ID,
  durablePortsWith,
  nameOf,
} from './history-navigation-test-support'
import {
  FOLDER_ID,
  FOLDER_NAME,
  addAFloor,
  chooseAnActionOf,
  listFolderProject,
  openFirstProject,
  openFirstProjectOn,
  setUpProjectsScreenTests,
  showThePageOn,
} from './projects-screen-test-support'

const OTHER_TAB_SENTENCE = 'This project is open in another tab.'
const NOT_SAVED_SENTENCE =
  'The changes of the open project could not be saved, so nothing was deleted.'
const FOLDER_NOT_SAVED_SENTENCE =
  'The changes of the open project could not be saved, so the folder stays in the list.'
const PACK_SCOPE = 'pack:vernacular-starter@1.0.0'
const FIRST_NAME = nameOf(FIRST_ID)
const SECOND_NAME = nameOf(SECOND_ID)

/** What the library of the application lists now, and whether listing it fails. A case sets it. */
const library = vi.hoisted(() => ({ items: [] as LibraryItem[], rejects: false }))

vi.mock('./create-asset-library-registry', async () => {
  const { AssetRegistry, InMemoryAssetCache, UserSource } = await import('../storage')
  const userIndex = { list: () => Promise.resolve([]), add: () => Promise.resolve() }
  const packSource = {
    id: 'pack',
    read: () => Promise.resolve(undefined),
    list: () =>
      library.rejects
        ? Promise.reject(new Error('The library cannot be read.'))
        : Promise.resolve(library.items),
  }
  return {
    createAssetLibrary: () => ({
      registry: new AssetRegistry([{ kind: 'pack', source: packSource }]),
      userSource: new UserSource(new InMemoryAssetCache(), userIndex),
    }),
  }
})

setUpProjectsScreenTests()
afterEach(() => {
  library.items = []
  library.rejects = false
})

/** Waits until the page lists no card named `name`. */
const waitForNoCardNamed = (name: string) =>
  waitFor(() => expect(screen.queryByRole('link', { name })).toBeNull())

describe('A delete from the card of a project on the Projects page', () => {
  it('Cancel counts no write', async () => {
    const ports = await durablePortsWith(FIRST_ID, SECOND_ID)
    renderAppAt(ports, PROJECTS_ADDRESS)
    await findCardLink(SECOND_NAME)
    await settleForAWhile()
    const filesBefore = await treeOf(ports.root)
    const recordsBefore = await ports.index.all()
    const writes = [
      vi.spyOn(ports.workspace, 'save'),
      vi.spyOn(ports.workspace, 'delete'),
      vi.spyOn(ports.workspace, 'removeAssets'),
      vi.spyOn(ports.index, 'put'),
      vi.spyOn(ports.index, 'remove'),
    ]

    await chooseDeleteAndAnswer(SECOND_NAME, 'Cancel')
    await settleForAWhile()

    for (const write of writes) expect(write).not.toHaveBeenCalled()
    expect(await treeOf(ports.root)).toEqual(filesBefore)
    expect(await ports.index.all()).toEqual(recordsBefore)
    expect(await findCardLink(SECOND_NAME)).toBeInTheDocument()
  })

  it('removes the card and the project with Delete project, and the other card stays', async () => {
    const ports = await durablePortsWith(FIRST_ID, SECOND_ID)
    renderAppAt(ports, PROJECTS_ADDRESS)
    await findCardLink(SECOND_NAME)

    await chooseDeleteAndAnswer(SECOND_NAME, 'Delete project')

    await waitForNoCardNamed(SECOND_NAME)
    expect(await findCardLink(FIRST_NAME)).toBeInTheDocument()
    expect(await storedIds(ports)).toEqual([FIRST_ID])
  })

  it('keeps the page with no link back and no open project after the delete of the open project, and opens another card', async () => {
    const { bar } = await openFirstProject()
    await showThePageOn(bar)
    await findCardLink(FIRST_NAME)

    await chooseDeleteAndAnswer(FIRST_NAME, 'Delete project')

    await waitForNoCardNamed(FIRST_NAME)
    expect(theLinkBack()).toBeNull()
    expect(bar.hash()).toBe(PROJECTS_ADDRESS)
    await clickCardOf(SECOND_NAME)
    await expectOpenProject(SECOND_NAME)
  })

  it('removes an asset that only the deleted project used when the library does not hold it', async () => {
    const ports = await durablePortsWith(FIRST_ID, SECOND_ID)
    renderAppAt(ports, PROJECTS_ADDRESS)
    await findCardLink(SECOND_NAME)
    await givePoolAssetTo(ports, SECOND_ID)

    await chooseDeleteAndAnswer(SECOND_NAME, 'Delete project')

    await waitForNoCardNamed(SECOND_NAME)
    expect(await poolHashes(ports)).toEqual([])
  })

  it('leaves an asset that the library holds in the pool', async () => {
    const ports = await durablePortsWith(FIRST_ID, SECOND_ID)
    renderAppAt(ports, PROJECTS_ADDRESS)
    await findCardLink(SECOND_NAME)
    const hash = await givePoolAssetTo(ports, SECOND_ID)
    library.items = [furnitureItem({ scope: PACK_SCOPE, contentHash: hash })]

    await chooseDeleteAndAnswer(SECOND_NAME, 'Delete project')

    await waitForNoCardNamed(SECOND_NAME)
    expect(await poolHashes(ports)).toEqual([hash])
  })

  it('removes the project and no asset when the list of the library rejects', async () => {
    const ports = await durablePortsWith(FIRST_ID, SECOND_ID)
    renderAppAt(ports, PROJECTS_ADDRESS)
    await findCardLink(SECOND_NAME)
    const hash = await givePoolAssetTo(ports, SECOND_ID)
    library.rejects = true

    await chooseDeleteAndAnswer(SECOND_NAME, 'Delete project')

    await waitForNoCardNamed(SECOND_NAME)
    expect(await storedIds(ports)).toEqual([FIRST_ID])
    expect(await poolHashes(ports)).toEqual([hash])
  })

  it('says that another tab holds the project, and keeps the card, when the tab took it meanwhile', async () => {
    const ports = await durablePortsWith(FIRST_ID, SECOND_ID)
    renderAppAt(ports, PROJECTS_ADDRESS)
    await findCardLink(SECOND_NAME)
    ports.lockRegistry.add(SECOND_ID)

    await chooseDeleteAndAnswer(SECOND_NAME, 'Delete project')

    expect(await findThePageAlert()).toHaveTextContent(OTHER_TAB_SENTENCE)
    expect(await findCardLink(SECOND_NAME)).toBeInTheDocument()
    expect(await storedIds(ports)).toContain(SECOND_ID)
  })

  it('says that the changes of the open project were not saved, and keeps both cards, when its save fails', async () => {
    const ports = await durablePortsWith(FIRST_ID, SECOND_ID)
    const { bar } = await openFirstProjectOn(ports)
    await addAFloor()
    failSaves(ports.workspace)
    await showThePageOn(bar)
    await findCardLink(FIRST_NAME)

    await chooseDeleteAndAnswer(FIRST_NAME, 'Delete project')

    expect(await findThePageAlert()).toHaveTextContent(NOT_SAVED_SENTENCE)
    expect(await findCardLink(FIRST_NAME)).toBeInTheDocument()
    expect(await findCardLink(SECOND_NAME)).toBeInTheDocument()
  })
})

describe('Remove from list on the card of a folder project', () => {
  it('removes the card with no dialog, and leaves every file of the folder byte-identical', async () => {
    const ports = await durablePortsWith(FIRST_ID)
    const directory = await listFolderProject(ports, documentBytes(namedProject(FOLDER_NAME)))
    renderAppAt(ports, PROJECTS_ADDRESS)
    await findCardLink(FOLDER_NAME)
    const folderBefore = await treeOf(directory)

    await chooseAnActionOf(FOLDER_NAME, 'Remove from list')

    await waitForNoCardNamed(FOLDER_NAME)
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(await treeOf(directory)).toEqual(folderBefore)
    expect(await ports.index.get(FOLDER_ID)).toBeUndefined()
  })

  it('saves the open folder project into its folder, closes it, and removes the card', async () => {
    const ports = await durablePortsWith(FIRST_ID)
    const directory = await listFolderProject(ports, documentBytes(namedProject(FOLDER_NAME)))
    const { bar } = renderAppAt(ports, PROJECTS_ADDRESS)
    await clickCardOf(FOLDER_NAME)
    await expectOpenProject(FOLDER_NAME)
    await addAFloor()
    await showThePageOn(bar)
    await findCardLink(FOLDER_NAME)

    await chooseAnActionOf(FOLDER_NAME, 'Remove from list')

    await waitForNoCardNamed(FOLDER_NAME)
    expect(theLinkBack()).toBeNull()
    const saved = await directory.readFile(DOCUMENT_FILE)
    expect(projectOf(saved ?? new Uint8Array()).floors).toHaveLength(2)
  })

  it('keeps the folder in the list, and says why, when the save of the open folder project fails', async () => {
    const ports = await durablePortsWith(FIRST_ID)
    const directory = await listFolderProject(ports, documentBytes(namedProject(FOLDER_NAME)))
    const { bar } = renderAppAt(ports, PROJECTS_ADDRESS)
    await clickCardOf(FOLDER_NAME)
    await expectOpenProject(FOLDER_NAME)
    await addAFloor()
    vi.spyOn(directory, 'writeFile').mockRejectedValue(new Error('the folder cannot be written'))
    await showThePageOn(bar)
    await findCardLink(FOLDER_NAME)

    await chooseAnActionOf(FOLDER_NAME, 'Remove from list')

    expect(await findThePageAlert()).toHaveTextContent(FOLDER_NOT_SAVED_SENTENCE)
    expect(await findCardLink(FOLDER_NAME)).toBeInTheDocument()
    expect(await ports.folders.permission(FOLDER_ID)).toBe('granted')
  })
})

describe('The menus of the cards on the Projects page, with every action in place', () => {
  it.each([
    ['an ordinary card', FIRST_NAME, ['Rename', 'Export', 'Delete']],
    ['a card of a folder project', FOLDER_NAME, ['Rename', 'Export', 'Remove from list']],
    ['a card of a project that another tab holds', SECOND_NAME, ['Export']],
  ])('lists the actions of %s', async (_kind, name, entries) => {
    renderAppAt(await portsWithCardsOfEveryKind(), PROJECTS_ADDRESS)
    await findCardLink(name)

    expect(await menuEntriesOf(name)).toEqual(entries)
  })
})
