import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AssetReference } from '../core'
import type { LibraryItem } from '../storage'
import { IMAGE } from '../session/flows/import-file-test-kit'
import {
  REPAIRED_NAME,
  mixedPaintReferringTo,
  placeFolderProject,
} from '../session/flows/open-failed-test-kit'
import type { TestPorts } from '../session/handle/handle-test-kit'
import { bytesOf } from '../tests/fixtures/projects/versions/fixture-documents'
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
const MISSING_WARNING = /Vernacular could not find \d+ of the assets this project uses\./

/** The sentence for a repaired copy that lacks `count` assets, with its ending for one or several. */
function missingSentence(count: number): string {
  const ending = count === 1 ? 'It shows as missing.' : 'They show as missing.'
  return `Vernacular could not find ${count} of the assets this project uses. ${ending}`
}

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

/** Every asset reference that `value` holds, however deep. */
function referencesIn(value: unknown): AssetReference[] {
  if (typeof value !== 'object' || value === null) return []
  const { scope, contentHash } = value as Partial<AssetReference>
  const own =
    typeof scope === 'string' && typeof contentHash === 'string' ? [{ scope, contentHash }] : []
  return [...own, ...Object.values(value).flatMap(referencesIn)]
}

/** Moves the assets of the user to the pack, which no folder holds, so that a pack can supply them. */
function userAssetsAsPackAssets(key: string, value: unknown): unknown {
  return key === 'scope' && value === 'user' ? PACK_SCOPE : value
}

/**
 * Ports with a folder project that breaks the format rules, repairable, and refers only to assets of
 * a pack that the folder does not hold. Gives the library items that supply all of them.
 */
async function portsWithAFolderProjectReferringToPackAssets(): Promise<{
  readonly ports: TestPorts
  readonly supplies: LibraryItem[]
}> {
  const ports = await durablePortsWith()
  const { bytes } = await mixedPaintReferringTo(IMAGE, PACK_SCOPE)
  const document: unknown = JSON.parse(new TextDecoder().decode(bytes), userAssetsAsPackAssets)
  await placeFolderProject(ports, bytesOf(document))
  return { ports, supplies: referencesIn(document).map(furnitureItem) }
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
    const { ports, supplies } = await portsWithAFolderProjectReferringToPackAssets()
    library.items = supplies

    await openTheRepairedCopy(ports)

    await settleForAWhile()
    expect(screen.queryByText(MISSING_WARNING)).not.toBeInTheDocument()
  })

  it('warns that every asset shows as missing when no pack supplies any', async () => {
    const { ports, supplies } = await portsWithAFolderProjectReferringToPackAssets()

    await openTheRepairedCopy(ports)

    expect(supplies.length).toBeGreaterThan(1)
    expect(await screen.findByText(missingSentence(supplies.length))).toBeInTheDocument()
  })

  it('warns that one asset shows as missing when a pack supplies all the others', async () => {
    const { ports, supplies } = await portsWithAFolderProjectReferringToPackAssets()
    library.items = supplies.slice(1)

    await openTheRepairedCopy(ports)

    expect(await screen.findByText(missingSentence(1))).toBeInTheDocument()
  })
})
