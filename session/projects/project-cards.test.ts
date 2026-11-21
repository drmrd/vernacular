import { describe, expect, it, vi } from 'vitest'
import type { InMemoryDirectory, ProjectRecord } from '../../storage'
import { DOCUMENT_FILE, placeDocument, rememberFolder } from '../testing'
import type { TestPorts } from '../testing'
import { listProjectCards } from './project-cards'
import type { ProjectCardModel } from './project-cards'
import {
  documentNamed,
  folderRecord,
  notJsonBytes,
  placeSound,
  rebuildPorts,
  soundDocumentOf,
  soundRecordOf,
  STORED_AT,
} from './rebuild-test-kit'

const EARLY = '2026-10-01T08:00:00.000Z'
const MIDDLE = '2026-10-10T08:00:00.000Z'
const LATE = '2026-10-20T08:00:00.000Z'
const THREE_FLOORS = 3

/** Ports whose store holds a sound document for each workspace record and whose index holds the records. */
async function portsHolding(
  records: readonly ProjectRecord[],
  options: { durable?: boolean } = {},
): Promise<TestPorts> {
  const ports = rebuildPorts(options)
  const workspaceIds = records.filter((r) => r.location.kind === 'workspace').map((r) => r.id)
  await placeSound(ports, workspaceIds)
  for (const record of records) {
    if (record.location.kind === 'folder') {
      await rememberFolder(ports, record.id, soundDocumentOf(record.id))
    }
    await ports.index.put(record)
  }
  return ports
}

/** The cards by project id. */
function cardsById(cards: readonly ProjectCardModel[]): Record<string, ProjectCardModel> {
  return Object.fromEntries(cards.map((card) => [card.id, card]))
}

/** The state lines of each card, by project id. */
function linesById(cards: readonly ProjectCardModel[]) {
  return Object.fromEntries(cards.map((card) => [card.id, card.stateLines]))
}

/** A record of a folder project that did not open and still holds the drawing that it had. */
function failedFolderRecord(id: string): ProjectRecord {
  const lastOpen = { opened: false, build: 'an-older-build', reason: 'not-json' }
  return folderRecord(id, { lastOpen, preview: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' })
}

/** Stores bytes that are no project under `id`, so that the project does not open. */
function placeBrokenProject(ports: TestPorts, id: string): Promise<void> {
  return placeDocument(ports, id, notJsonBytes())
}

describe('the facts of a project card', () => {
  it('gives one card for each stored project, with its name, last change, and floor count', async () => {
    const records = [
      soundRecordOf('a', { name: 'The parlour house', floorCount: THREE_FLOORS }),
      soundRecordOf('b', { name: 'The barn', floorCount: undefined }),
    ]
    const ports = await portsHolding(records)
    await ports.index.put(soundRecordOf('gone'))

    const cards = await listProjectCards(ports)

    expect(
      cards.map(({ id, name, lastChangedAt, floorCount }) => ({
        id,
        name,
        lastChangedAt,
        floorCount,
      })),
    ).toEqual([
      { id: 'a', name: 'The parlour house', lastChangedAt: STORED_AT, floorCount: THREE_FLOORS },
      { id: 'b', name: 'The barn', lastChangedAt: STORED_AT, floorCount: undefined },
    ])
  })

  it('reads a project with no name as an unnamed project', async () => {
    const ports = await portsHolding([soundRecordOf('a', { name: undefined })])

    const [card] = await listProjectCards(ports)

    expect(card?.name).toBe('Unnamed project')
  })
})

describe('where a project card says its project is kept', () => {
  it('says the browser for a workspace project on durable ports', async () => {
    const ports = await portsHolding([soundRecordOf('a')], { durable: true })

    expect((await listProjectCards(ports))[0]?.location).toBe('browser')
  })

  it('says the tab for a workspace project on ports that are not durable', async () => {
    const ports = await portsHolding([soundRecordOf('a')], { durable: false })

    expect((await listProjectCards(ports))[0]?.location).toBe('tab')
  })

  it('names the folder of a folder project', async () => {
    const ports = await portsHolding([folderRecord('away')])

    expect((await listProjectCards(ports))[0]?.location).toEqual({ folderName: 'Old house' })
  })
})

describe('the preview of a project card', () => {
  it('shows the stored drawing, or nothing when the project has none', async () => {
    const drawn = soundRecordOf('drawn')
    const ports = await portsHolding([drawn, soundRecordOf('blank', { preview: undefined })])

    const cards = cardsById(await listProjectCards(ports))

    expect(drawn.preview).toBeDefined()
    expect(cards['drawn']?.preview).toEqual({ svg: drawn.preview })
    expect(cards['blank']?.preview).toBe('none')
  })

  it('says that a project did not open, also when its record holds a drawing', async () => {
    const ports = await portsHolding([failedFolderRecord('away')])
    await placeBrokenProject(ports, 'broken')

    const cards = cardsById(await listProjectCards(ports))

    expect(cards['away']?.preview).toBe('did-not-open')
    expect(cards['broken']?.preview).toBe('did-not-open')
  })
})

describe('the state lines of a project card', () => {
  it('marks the open project as open here, and no card when none is open', async () => {
    const ports = await portsHolding([soundRecordOf('a'), soundRecordOf('b')])

    expect(linesById(await listProjectCards(ports, 'a'))).toEqual({ a: ['open-here'], b: [] })
    expect(linesById(await listProjectCards(ports))).toEqual({ a: [], b: [] })
  })

  it('marks a project that another tab holds as open elsewhere, and the open project as open here', async () => {
    const ports = await portsHolding([soundRecordOf('a'), soundRecordOf('b')])
    ports.lockRegistry.add('a')
    ports.lockRegistry.add('b')

    expect(linesById(await listProjectCards(ports, 'b'))).toEqual({
      a: ['open-elsewhere'],
      b: ['open-here'],
    })
  })

  it('marks a folder that needs permission, and no other card', async () => {
    const ports = await portsHolding([folderRecord('f1'), folderRecord('f2')])
    ports.folders.setPermission('f1', 'prompt')
    ports.folders.setPermission('f2', 'granted')

    expect(linesById(await listProjectCards(ports))).toEqual({ f1: ['needs-permission'], f2: [] })
  })

  it('does not ask for the permission of a workspace project', async () => {
    const ports = await portsHolding([soundRecordOf('a')])
    const permission = vi.spyOn(ports.folders, 'permission')

    const [card] = await listProjectCards(ports)

    expect(card?.stateLines).toEqual([])
    expect(permission).not.toHaveBeenCalled()
  })
})

describe('the actions of a project card', () => {
  it('offers each kind of project the actions that suit it', async () => {
    const ports = await portsHolding([
      soundRecordOf('plain'),
      folderRecord('plainFolder'),
      soundRecordOf('held'),
      folderRecord('heldFolder'),
      failedFolderRecord('failedFolder'),
    ])
    await placeBrokenProject(ports, 'failed')
    ports.lockRegistry.add('held')
    ports.lockRegistry.add('heldFolder')

    const cards = await listProjectCards(ports)

    expect(Object.fromEntries(cards.map((card) => [card.id, card.actions]))).toEqual({
      plain: ['rename', 'export', 'delete'],
      plainFolder: ['rename', 'export', 'remove-from-list'],
      held: ['export'],
      heldFolder: ['export'],
      failed: ['export', 'delete'],
      failedFolder: ['export', 'remove-from-list'],
    })
  })
})

describe('the order of the project cards', () => {
  it('puts the latest use first, a project with no use time last, and breaks ties by id', async () => {
    const ports = await portsHolding([
      soundRecordOf('old', { lastUsedAt: EARLY }),
      soundRecordOf('tie-b', { lastUsedAt: MIDDLE }),
      folderRecord('never', { lastUsedAt: undefined }),
      soundRecordOf('tie-a', { lastUsedAt: MIDDLE }),
      soundRecordOf('new', { lastUsedAt: LATE }),
    ])

    const cards = await listProjectCards(ports)

    expect(cards.map((card) => card.id)).toEqual(['new', 'tie-a', 'tie-b', 'old', 'never'])
  })
})

describe('a project card list when a port refuses', () => {
  it('still gives the cards, with none open elsewhere, when the held locks cannot be read', async () => {
    const ports = await portsHolding([soundRecordOf('a'), soundRecordOf('b')])
    ports.lockRegistry.add('a')
    vi.spyOn(ports.locks, 'heldIds').mockRejectedValue(new Error('the locks cannot be read'))

    expect(linesById(await listProjectCards(ports))).toEqual({ a: [], b: [] })
  })

  it('still gives the cards when the permission of one folder cannot be read', async () => {
    const ports = await portsHolding([folderRecord('f1'), folderRecord('f2'), folderRecord('f3')])
    for (const id of ['f1', 'f2', 'f3']) ports.folders.setPermission(id, 'prompt')
    const real = ports.folders.permission.bind(ports.folders)
    vi.spyOn(ports.folders, 'permission').mockImplementation((id) =>
      id === 'f2' ? Promise.reject(new Error('no answer')) : real(id),
    )

    expect(linesById(await listProjectCards(ports))).toEqual({
      f1: ['needs-permission'],
      f2: [],
      f3: ['needs-permission'],
    })
  })
})

/** The bytes of the document of each workspace project `ids`, and of the folder directory. */
async function storedBytes(ports: TestPorts, ids: readonly string[], folder: InMemoryDirectory) {
  const workspace = ids.map((id) => ports.root.readFile(`${id}/${DOCUMENT_FILE}`))
  return Promise.all([...workspace, folder.readFile(DOCUMENT_FILE)])
}

describe('what listing the project cards leaves alone', () => {
  it('takes no lock, opens and picks no folder, and changes no stored document', async () => {
    const ports = await portsHolding([soundRecordOf('a'), soundRecordOf('b')])
    const folder = await rememberFolder(ports, 'away', documentNamed('In the folder'))
    await ports.index.put(folderRecord('away'))
    const before = await storedBytes(ports, ['a', 'b'], folder)
    const acquire = vi.spyOn(ports.locks, 'tryAcquire')
    const reopen = vi.spyOn(ports.folders, 'reopen')
    const pick = vi.spyOn(ports.folders, 'pick')

    await listProjectCards(ports, 'a')

    expect([acquire, reopen, pick].map((spy) => spy.mock.calls.length)).toEqual([0, 0, 0])
    expect(await storedBytes(ports, ['a', 'b'], folder)).toEqual(before)
    expect(before.every((bytes) => bytes !== undefined)).toBe(true)
  })
})
