import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bundleFilename } from '../storage'
import { findCardLink, renderAppAt } from './app-test-support'
import { recordDownloads } from './card-actions-test-support'
import {
  FIRST_ID,
  PROJECTS_ADDRESS,
  durablePortsWith,
  nameOf,
} from './history-navigation-test-support'
import {
  FOLDER_NAME,
  chooseAnActionOf,
  portsWithAFolderProject,
  setUpProjectsScreenTests,
} from './projects-screen-test-support'

const LIBRARY_LISTED = 'the library was listed'
const FOLDER_PERMISSION_ASKED = 'the folder permission was asked'

/** What the application did that these cases watch, in the order it did it. A case reads it after the export. */
const steps = vi.hoisted(() => ({ order: [] as string[] }))

vi.mock('./create-asset-library-registry', async () => {
  const { AssetRegistry, InMemoryAssetCache, UserSource } = await import('../storage')
  const userIndex = { list: () => Promise.resolve([]), add: () => Promise.resolve() }
  const packSource = {
    id: 'pack',
    read: () => Promise.resolve(undefined),
    list: () => {
      steps.order.push('the library was listed')
      return Promise.resolve([])
    },
  }
  return {
    createAssetLibrary: () => ({
      registry: new AssetRegistry([{ kind: 'pack', source: packSource }]),
      userSource: new UserSource(new InMemoryAssetCache(), userIndex),
    }),
  }
})

setUpProjectsScreenTests()
const downloads = recordDownloads()
afterEach(() => {
  steps.order.length = 0
})

describe('The order of the steps of an export from a card', () => {
  it('asks for the permission of a closed folder before it lists the library', async () => {
    const ports = await portsWithAFolderProject()
    const reopen = ports.folders.reopen.bind(ports.folders)
    vi.spyOn(ports.folders, 'reopen').mockImplementation((id) => {
      steps.order.push(FOLDER_PERMISSION_ASKED)
      return reopen(id)
    })
    renderAppAt(ports, PROJECTS_ADDRESS)
    await findCardLink(FOLDER_NAME)

    await chooseAnActionOf(FOLDER_NAME, 'Export')

    expect(await screen.findByText(`Exported ${bundleFilename(FOLDER_NAME)}`)).toBeInTheDocument()
    expect(steps.order).toEqual([FOLDER_PERMISSION_ASKED, LIBRARY_LISTED])
  })

  it('lists the library and exports a project of the workspace, which needs no folder permission', async () => {
    const ports = await durablePortsWith(FIRST_ID)
    const reopen = vi.spyOn(ports.folders, 'reopen')
    renderAppAt(ports, PROJECTS_ADDRESS)
    await findCardLink(nameOf(FIRST_ID))

    await chooseAnActionOf(nameOf(FIRST_ID), 'Export')

    expect(
      await screen.findByText(`Exported ${bundleFilename(nameOf(FIRST_ID))}`),
    ).toBeInTheDocument()
    expect(steps.order).toEqual([LIBRARY_LISTED])
    expect(reopen).not.toHaveBeenCalled()
    expect(downloads.fileNames).toEqual([bundleFilename(nameOf(FIRST_ID))])
  })
})
