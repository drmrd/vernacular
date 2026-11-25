import { describe, expect, it } from 'vitest'
import type { ProjectLockPort, ProjectRecord } from '../../storage'
import { SECOND_FILE_NAME } from '../handle/second-file-test-kit'
import { rememberFolder } from '../testing'
import type { TestPorts } from '../testing'
import { listProjectCards } from './project-cards'
import {
  folderRecord,
  placeSound,
  rebuildPorts,
  soundDocumentOf,
  soundRecordOf,
} from './rebuild-test-kit'

/** Ports that hold each record of `records`, with a sound document for it. */
async function portsHolding(records: readonly ProjectRecord[]): Promise<TestPorts> {
  const ports = rebuildPorts()
  await placeSound(
    ports,
    records.filter((r) => r.location.kind === 'workspace').map((r) => r.id),
  )
  for (const record of records) {
    if (record.location.kind === 'folder') {
      await rememberFolder(ports, record.id, soundDocumentOf(record.id))
    }
    await ports.index.put(record)
  }
  return ports
}

/** The card of project `id` among the cards that `listProjectCards` gives for `openId`. */
async function cardOf(ports: TestPorts, id: string, openId?: string) {
  const cards = await listProjectCards(ports, openId)
  return cards.find((card) => card.id === id)
}

describe('the state lines and actions of the open project card', () => {
  it('gives the project that this tab has open its open-here line and the actions of its kind', async () => {
    const ports = await portsHolding([
      soundRecordOf('workspaceProject'),
      folderRecord('folderProject'),
    ])
    ports.lockRegistry.add('workspaceProject')
    ports.lockRegistry.add('folderProject')

    const inWorkspace = await cardOf(ports, 'workspaceProject', 'workspaceProject')
    const inFolder = await cardOf(ports, 'folderProject', 'folderProject')

    expect(inWorkspace?.stateLines).toEqual(['open-here'])
    expect(inWorkspace?.actions).toEqual(['rename', 'export', 'delete'])
    expect(inFolder?.stateLines).toEqual(['open-here'])
    expect(inFolder?.actions).toEqual(['rename', 'export', 'remove-from-list'])
  })
})

describe('the state lines of a folder card with two of them', () => {
  it('lists open elsewhere before needs permission for a folder that another tab holds', async () => {
    const ports = await portsHolding([folderRecord('away')])
    ports.lockRegistry.add('away')
    ports.folders.setPermission('away', 'prompt')

    expect((await cardOf(ports, 'away'))?.stateLines).toEqual([
      'open-elsewhere',
      'needs-permission',
    ])
  })
})

describe('the state lines of a project card where the locks are not supported', () => {
  it('gives no card the open-elsewhere line, even for an id that the lock port lists as held', async () => {
    const base = await portsHolding([soundRecordOf('a'), soundRecordOf('b')])
    const locks: ProjectLockPort = {
      supported: false,
      tryAcquire: () => Promise.resolve(undefined),
      heldIds: () => Promise.resolve(new Set(['a'])),
    }

    const cards = await listProjectCards({ ...base, locks }, 'b')

    expect(cards.map((card) => [card.id, card.stateLines, card.actions])).toEqual([
      ['a', [], ['rename', 'export', 'delete']],
      ['b', ['open-here'], ['rename', 'export', 'delete']],
    ])
  })
})

describe('the second plan file line and action of a project card', () => {
  const secondFile = { name: SECOND_FILE_NAME, read: 'main' } as const

  it('keeps the line on a project that another tab holds, and offers only Export', async () => {
    const ports = await portsHolding([soundRecordOf('held', { secondFile })])
    ports.lockRegistry.add('held')

    const card = await cardOf(ports, 'held')

    expect(card?.stateLines).toContain('second-file')
    expect(card?.stateLines).toContain('open-elsewhere')
    expect(card?.actions).toEqual(['export'])
  })

  it('gives neither the line nor the action to a project that did not open', async () => {
    const lastOpen = { opened: false, build: 'an-older-build', reason: 'not-json' }
    const ports = await portsHolding([folderRecord('away', { lastOpen, secondFile })])

    const card = await cardOf(ports, 'away')

    expect(card?.stateLines).not.toContain('second-file')
    expect(card?.actions).toEqual(['export', 'remove-from-list'])
  })

  it('gives the project that this tab has open the line and the action', async () => {
    const ports = await portsHolding([soundRecordOf('mine', { secondFile })])
    ports.lockRegistry.add('mine')

    const card = await cardOf(ports, 'mine', 'mine')

    expect(card?.stateLines).toContain('open-here')
    expect(card?.stateLines).toContain('second-file')
    expect(card?.actions).toEqual(['rename', 'export', 'choose-file', 'delete'])
  })
})
