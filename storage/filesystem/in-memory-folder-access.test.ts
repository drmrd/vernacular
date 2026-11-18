import { describe, expect, it } from 'vitest'
import { createEmptyProject, decodeDocument } from '../../core'
import { DocumentStore } from '../documents/document-store'
import { InMemoryDirectory } from '../fs/in-memory-directory'
import { FolderFiles } from '../project-files/folder-files'
import { InMemoryFolderAccess } from './folder-access'

const PROJECT_FILE = 'vernacular.json'
const FOLDER_ID = 'house'

/** What a reopened folder gives, with a failure if it gave a refusal instead of files. */
async function filesOf(access: InMemoryFolderAccess, id: string): Promise<FolderFiles> {
  const result = await access.reopen(id)
  if (typeof result === 'string') throw new Error(`Expected files but got "${result}".`)
  return result
}

/** A folder access that remembers a new empty directory under the id; returns both. */
async function accessRemembering(
  id: string,
): Promise<{ access: InMemoryFolderAccess; directory: InMemoryDirectory }> {
  const access = new InMemoryFolderAccess()
  const directory = new InMemoryDirectory()
  await access.remember(id, access.addFolder(directory))
  return { access, directory }
}

function describeSupport(): void {
  it('supports folders by default', () => {
    expect(new InMemoryFolderAccess().supported).toBe(true)
  })

  it('does not support folders when built unsupported', () => {
    expect(new InMemoryFolderAccess({ supported: false }).supported).toBe(false)
  })
}

function describePicking(): void {
  it('gives the queued handle once and then nothing', async () => {
    const access = new InMemoryFolderAccess()
    const handle = access.addFolder(new InMemoryDirectory())
    access.pickNext(handle)

    expect(await access.pick()).toBe(handle)
    expect(await access.pick()).toBeUndefined()
  })

  it('gives nothing when no handle is queued', async () => {
    expect(await new InMemoryFolderAccess().pick()).toBeUndefined()
  })

  it('gives nothing after the user is set to cancel', async () => {
    const access = new InMemoryFolderAccess()
    access.pickNext(access.addFolder(new InMemoryDirectory()))
    access.pickNext(undefined)

    expect(await access.pick()).toBeUndefined()
  })
}

function describeKnownFolders(): void {
  it('hands out a different stand-in handle on each call for one directory', () => {
    const access = new InMemoryFolderAccess()
    const directory = new InMemoryDirectory()

    expect(access.addFolder(directory)).not.toBe(access.addFolder(directory))
  })

  it('finds the id of a second handle of the same directory', async () => {
    const { access, directory } = await accessRemembering(FOLDER_ID)

    expect(await access.findKnown(access.addFolder(directory))).toBe(FOLDER_ID)
  })

  it('finds nothing for the handle of another directory', async () => {
    const { access } = await accessRemembering(FOLDER_ID)

    expect(await access.findKnown(access.addFolder(new InMemoryDirectory()))).toBeUndefined()
  })

  it('finds nothing for a folder that was forgotten', async () => {
    const { access, directory } = await accessRemembering(FOLDER_ID)

    await access.forget(FOLDER_ID)

    expect(await access.findKnown(access.addFolder(directory))).toBeUndefined()
  })
}

function describePermissions(): void {
  it('reports a folder that is not remembered as missing', async () => {
    expect(await new InMemoryFolderAccess().permission(FOLDER_ID)).toBe('missing')
  })

  it('reports a remembered folder as granted until told otherwise', async () => {
    const { access } = await accessRemembering(FOLDER_ID)

    expect(await access.permission(FOLDER_ID)).toBe('granted')
  })

  it.each(['granted', 'prompt', 'denied'] as const)(
    'reports the %s state that was set for a remembered folder',
    async (state) => {
      const { access } = await accessRemembering(FOLDER_ID)

      access.setPermission(FOLDER_ID, state)

      expect(await access.permission(FOLDER_ID)).toBe(state)
    },
  )
}

function describeRefusals(): void {
  it('reports a folder that is not remembered as missing on reopen', async () => {
    expect(await new InMemoryFolderAccess().reopen(FOLDER_ID)).toBe('missing')
  })

  it('reports a denied folder as denied on reopen', async () => {
    const { access } = await accessRemembering(FOLDER_ID)
    access.setPermission(FOLDER_ID, 'denied')

    expect(await access.reopen(FOLDER_ID)).toBe('denied')
  })

  it('reports a folder that was forgotten as missing on reopen', async () => {
    const { access } = await accessRemembering(FOLDER_ID)

    await access.forget(FOLDER_ID)

    expect(await access.reopen(FOLDER_ID)).toBe('missing')
  })
}

function describeReopening(): void {
  it.each(['granted', 'prompt'] as const)(
    'gives the files of a folder in the %s state, bound to its id and durable',
    async (state) => {
      const { access } = await accessRemembering(FOLDER_ID)
      access.setPermission(FOLDER_ID, state)

      const files = await filesOf(access, FOLDER_ID)

      expect(files).toBeInstanceOf(FolderFiles)
      expect(files.durable).toBe(true)
    },
  )

  it('grants access once the user was asked on reopen', async () => {
    const { access } = await accessRemembering(FOLDER_ID)
    access.setPermission(FOLDER_ID, 'prompt')

    await access.reopen(FOLDER_ID)

    expect(await access.permission(FOLDER_ID)).toBe('granted')
  })

  it('lists its id when the directory holds a document file', async () => {
    const { access, directory } = await accessRemembering(FOLDER_ID)
    await directory.writeFile(PROJECT_FILE, Uint8Array.of(1))

    expect(await (await filesOf(access, FOLDER_ID)).ids()).toEqual([FOLDER_ID])
  })

  it('lists no id when the directory holds no document file', async () => {
    const { access } = await accessRemembering(FOLDER_ID)

    expect(await (await filesOf(access, FOLDER_ID)).ids()).toEqual([])
  })

  it('saves a document at the root of the remembered directory', async () => {
    const { access, directory } = await accessRemembering(FOLDER_ID)
    const project = createEmptyProject({
      name: 'House',
      units: 'metric',
      period: 'craftsman',
      appVersion: '0.1.0',
    })

    await new DocumentStore(await filesOf(access, FOLDER_ID)).save(FOLDER_ID, project)

    const bytes = await directory.readFile(PROJECT_FILE)
    expect(bytes).toBeDefined()
    expect(decodeDocument(bytes ?? new Uint8Array()).ok).toBe(true)
  })
}

describe('InMemoryFolderAccess support', describeSupport)
describe('InMemoryFolderAccess picking', describePicking)
describe('InMemoryFolderAccess known folders', describeKnownFolders)
describe('InMemoryFolderAccess permissions', describePermissions)
describe('InMemoryFolderAccess refusals on reopen', describeRefusals)
describe('InMemoryFolderAccess reopening', describeReopening)
