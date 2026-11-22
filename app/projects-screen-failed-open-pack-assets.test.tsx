import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LibraryItem } from '../storage'
import {
  REPAIRED_NAME,
  placeFolderProjectReferringToImage,
} from '../session/flows/open-failed-test-kit'
import type { TestPorts } from '../session/handle/handle-test-kit'
import { furnitureItem } from './action-test-support'
import {
  expectOpenProject,
  findTheProjectsPage,
  renderAppAt,
  settleForAWhile,
} from './app-test-support'
import {
  clickInTheDialog,
  findTheFailedOpenDialog,
  openTheChoice,
} from './failed-open-dialog-test-support'
import { PROJECTS_ADDRESS, durablePortsWith } from './history-navigation-test-support'
import { setUpProjectsScreenTests } from './projects-screen-test-support'

const PACK_SCOPE = 'pack:vernacular-starter@1.0.0'
const MISSING_WARNING = /shows as missing/

/** What the library of the application lists now. A case sets it before it renders. */
const library = vi.hoisted(() => ({ items: [] as LibraryItem[] }))

vi.mock('./create-asset-library-registry', async () => {
  const { AssetRegistry, InMemoryAssetCache, UserSource } = await import('../storage')
  const userIndex = { list: () => Promise.resolve([]), add: () => Promise.resolve() }
  const packSource = {
    id: 'pack',
    read: () => Promise.resolve(undefined),
    list: () => Promise.resolve(library.items),
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
})

/**
 * Ports with a folder project that breaks the format rules, repairable, and refers to an image of a
 * pack that the folder does not hold. Gives the reference of that image through the library.
 */
async function portsWithAFolderProjectReferringToAPackImage(): Promise<{
  readonly ports: TestPorts
  readonly item: LibraryItem
}> {
  const ports = await durablePortsWith()
  const { imageHash } = await placeFolderProjectReferringToImage(ports, PACK_SCOPE)
  return { ports, item: furnitureItem({ scope: PACK_SCOPE, contentHash: imageHash }) }
}

/** Opens the dialog from the card of the project, chooses the repair, and opens it as a new project. */
async function openTheRepairedCopy(ports: TestPorts): Promise<void> {
  renderAppAt(ports, PROJECTS_ADDRESS)
  const page = await findTheProjectsPage()
  await userEvent.click(await within(page).findByRole('link'))
  const choice = await openTheChoice(await findTheFailedOpenDialog())
  await clickInTheDialog(choice, 'Open as a new project')
  await expectOpenProject(REPAIRED_NAME)
}

describe('The repaired copy of a folder project that refers to an asset of a pack', () => {
  it('shows no missing-asset warning when an installed pack supplies the asset', async () => {
    const { ports, item } = await portsWithAFolderProjectReferringToAPackImage()
    library.items = [item]

    await openTheRepairedCopy(ports)

    await settleForAWhile()
    expect(screen.queryByText(MISSING_WARNING)).not.toBeInTheDocument()
  })

  it('warns that the asset shows as missing when no pack supplies it', async () => {
    const { ports } = await portsWithAFolderProjectReferringToAPackImage()

    await openTheRepairedCopy(ports)

    await waitFor(() => expect(screen.getByText(MISSING_WARNING)).toBeInTheDocument())
  })
})
