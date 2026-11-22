import { describe, expect, it } from 'vitest'
import {
  CommandRegistry,
  Dispatcher,
  createEmptyProject,
  createFloor,
  createFurnitureInstance,
  encodeDocument,
  placeFurniture,
  registerAllProjectCommands,
  setFloorPeriod,
  setFurnitureName,
  setOpeningLight,
  setProjectStyle,
  clearOpeningLight,
} from '../../core'
import type { Command, Project } from '../../core'
import { readProject } from '../../storage/documents/document-store-test-kit'
import { InMemoryDirectory } from '../../storage/fs/in-memory-directory'
import { DocumentStore, FolderFiles } from '../../storage'

const FLOOR_ID = 'floor-1'
const FURNITURE_ID = 'furniture-1'
const PROJECT_ID = 'house'
const OPENING_LIGHT = { observedAt: '2026-06-21T08:00' }

function dispatcherFor(project: Project): Dispatcher<Project> {
  return new Dispatcher(project, registerAllProjectCommands(new CommandRegistry<Project>()))
}

/** A project in which every field under test is set, built with the commands that set them. */
function projectWithEveryFieldSet(): Project {
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.0.0',
  })
  project.floors = [createFloor('Ground', { id: FLOOR_ID })]
  const dispatcher = dispatcherFor(project)
  dispatcher.dispatch(setProjectStyle({ styleId: 'italianate' }))
  dispatcher.dispatch(setFloorPeriod(FLOOR_ID, 'edwardian'))
  dispatcher.dispatch(
    placeFurniture(
      FLOOR_ID,
      createFurnitureInstance({
        assetRef: { scope: 'user', contentHash: 'hash-1' },
        position: { x: 100, y: 200 },
        footprint: { width: 600, depth: 600 },
        id: FURNITURE_ID,
      }),
    ),
  )
  dispatcher.dispatch(setFurnitureName(FLOOR_ID, FURNITURE_ID, 'Armchair'))
  dispatcher.dispatch(setOpeningLight(OPENING_LIGHT))
  return project
}

interface StoredFurniture {
  id: string
  name?: string
}

interface StoredDocument {
  meta: { style?: unknown }
  openingLight?: unknown
  floors: { periodOverride?: unknown; furniture: StoredFurniture[] }[]
}

function decode(bytes: Uint8Array | undefined): StoredDocument {
  return JSON.parse(new TextDecoder().decode(bytes!)) as StoredDocument
}

/** A store whose directory already holds the document that has every field set. */
async function storeHoldingFullDocument(): Promise<{
  store: DocumentStore
  directory: InMemoryDirectory
}> {
  const directory = new InMemoryDirectory()
  await directory.writeFile(
    'vernacular.json',
    encodeDocument(projectWithEveryFieldSet(), undefined).bytes,
  )
  return {
    store: new DocumentStore(new FolderFiles(PROJECT_ID, directory, { durable: true })),
    directory,
  }
}

async function clearSaveAndReload(command: Command<unknown>): Promise<StoredDocument> {
  const { store, directory } = await storeHoldingFullDocument()
  const loaded = await readProject(store, PROJECT_ID)
  dispatcherFor(loaded).dispatch(command)
  await store.save(PROJECT_ID, loaded)
  return decode(await directory.readFile('vernacular.json'))
}

describe('a cleared field stays cleared across a document store save', () => {
  it('starts from a stored document that has every field set', async () => {
    const { directory } = await storeHoldingFullDocument()

    const stored = decode(await directory.readFile('vernacular.json'))

    expect(stored.meta.style).toEqual({ styleId: 'italianate' })
    expect(stored.floors[0]?.periodOverride).toBe('edwardian')
    expect(stored.floors[0]?.furniture[0]?.name).toBe('Armchair')
    expect(stored.openingLight).toEqual(OPENING_LIGHT)
  })

  it('keeps the project style cleared', async () => {
    const saved = await clearSaveAndReload(setProjectStyle(undefined))

    expect('style' in saved.meta).toBe(false)
  })

  it('keeps a floor period override cleared', async () => {
    const saved = await clearSaveAndReload(setFloorPeriod(FLOOR_ID, undefined))

    expect('periodOverride' in saved.floors[0]!).toBe(false)
  })

  it('keeps a furniture name cleared', async () => {
    const saved = await clearSaveAndReload(setFurnitureName(FLOOR_ID, FURNITURE_ID, ''))

    expect('name' in saved.floors[0]!.furniture[0]!).toBe(false)
  })

  it('keeps the opening light cleared', async () => {
    const saved = await clearSaveAndReload(clearOpeningLight())

    expect('openingLight' in saved).toBe(false)
  })
})
