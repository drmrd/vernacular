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
  describeRemovalAtADirectory()
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

function describeRemovalAtADirectory(): void {
  it('resolves and leaves an empty directory where it is when removeFile names it', async () => {
    const directory = new FileSystemDirectory(testDirectory)
    await testDirectory.getDirectoryHandle('empty', { create: true })

    await expect(directory.removeFile('empty')).resolves.toBeUndefined()

    const kept = await testDirectory.getDirectoryHandle('empty')
    expect(kept.kind).toBe('directory')
  })

  it('resolves and keeps the files when removeFile names a directory that holds a file', async () => {
    const directory = new FileSystemDirectory(testDirectory)
    await directory.writeFile('a/b', Uint8Array.of(5, 6))

    await expect(directory.removeFile('a')).resolves.toBeUndefined()

    expect(await directory.readFile('a/b')).toEqual(Uint8Array.of(5, 6))
  })

  it('resolves and leaves an empty directory inside a directory where it is', async () => {
    const directory = new FileSystemDirectory(testDirectory)
    const outer = await testDirectory.getDirectoryHandle('deep', { create: true })
    await outer.getDirectoryHandle('empty', { create: true })

    await expect(directory.removeFile('deep/empty')).resolves.toBeUndefined()

    const kept = await outer.getDirectoryHandle('empty')
    expect(kept.kind).toBe('directory')
  })

  it('removes a file and resolves for a path that does not exist', async () => {
    const directory = new FileSystemDirectory(testDirectory)
    await directory.writeFile('f.txt', Uint8Array.of(1))

    await directory.removeFile('f.txt')

    expect(await directory.readFile('f.txt')).toBeUndefined()
    await expect(directory.removeFile('none.txt')).resolves.toBeUndefined()
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
