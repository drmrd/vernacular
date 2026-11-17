import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assertDirectoryPortContract } from './directory-contract'
import { FileSystemDirectory } from './file-system-directory'

const MILLISECONDS_PER_SECOND = 1000

let testDirectoryName = ''
let testDirectory: FileSystemDirectoryHandle

beforeEach(async () => {
  const root = await navigator.storage.getDirectory()
  testDirectoryName = `vernacular-directory-test-${crypto.randomUUID()}`
  testDirectory = await root.getDirectoryHandle(testDirectoryName, { create: true })
})

afterEach(async () => {
  const root = await navigator.storage.getDirectory()
  await root.removeEntry(testDirectoryName, { recursive: true })
})

assertDirectoryPortContract(
  'FileSystemDirectory on the origin private file system',
  () => new FileSystemDirectory(testDirectory),
)

describe('FileSystemDirectory on the origin private file system', () => {
  describeTreeRemoval()
  describeFileRemoval()
  describeModificationTime()
})

function describeTreeRemoval(): void {
  it('leaves no entry of the removed name in the directory after removeTree', async () => {
    const directory = new FileSystemDirectory(testDirectory)
    await directory.writeFile('a/deep/y', Uint8Array.of(1))

    await directory.removeTree('a')

    await expect(testDirectory.getDirectoryHandle('a')).rejects.toMatchObject({
      name: 'NotFoundError',
    })
  })
}

function describeFileRemoval(): void {
  it('keeps the directory of a removed file even when it was the only file there', async () => {
    const directory = new FileSystemDirectory(testDirectory)
    await directory.writeFile('d/x', Uint8Array.of(1))

    await directory.removeFile('d/x')

    const kept = await testDirectory.getDirectoryHandle('d')
    expect(kept.kind).toBe('directory')
  })
}

function describeModificationTime(): void {
  it('reports no modification time for a directory', async () => {
    const directory = new FileSystemDirectory(testDirectory)
    await directory.writeFile('d/x', Uint8Array.of(1))

    expect(await directory.modifiedAt('d')).toBeUndefined()
  })

  it('reports an ISO time of a written file no earlier than the second before the write', async () => {
    const directory = new FileSystemDirectory(testDirectory)
    const clockBefore = Math.floor(Date.now() / MILLISECONDS_PER_SECOND) * MILLISECONDS_PER_SECOND

    await directory.writeFile('doc.json', Uint8Array.of(1))

    const modified = await directory.modifiedAt('doc.json')
    expect(new Date(Date.parse(modified ?? '')).toISOString()).toBe(modified)
    expect(Date.parse(modified ?? '')).toBeGreaterThanOrEqual(clockBefore)
  })
}
