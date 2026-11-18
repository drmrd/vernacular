import { describe, expect, it } from 'vitest'
import type { DirectoryPort } from './directory-port'

/**
 * Reusable behavioral contract for any {@link DirectoryPort} implementation.
 *
 * Call this once from a test file, passing a factory that returns a fresh,
 * empty port. Each assertion runs against its own port from `makeEmpty()`, so
 * the suites stay independent. Later cycles (the File System Access adapter,
 * for example) reuse this helper to prove they honor the same contract.
 *
 * @param label - Human-readable name of the implementation under test, used as
 *   the `describe` block title.
 * @param makeEmpty - Builds a fresh, empty port for a single assertion.
 */
export function assertDirectoryPortContract(label: string, makeEmpty: () => DirectoryPort): void {
  const bytes = (...values: number[]) => Uint8Array.from(values)

  describe(`${label} satisfies the DirectoryPort contract`, () => {
    it('resolves to undefined when reading a path that has no file', async () => {
      const directory = makeEmpty()

      expect(await directory.readFile('doc.json')).toBeUndefined()
    })

    it('reads back byte-equal content after a write', async () => {
      const directory = makeEmpty()

      await directory.writeFile('doc.json', bytes(1, 2, 3))

      const read = await directory.readFile('doc.json')
      expect(read).toEqual(bytes(1, 2, 3))
    })

    it('overwrites the file when writing the same path twice', async () => {
      const directory = makeEmpty()

      await directory.writeFile('doc.json', bytes(1, 2, 3))
      await directory.writeFile('doc.json', bytes(9, 8))

      expect(await directory.readFile('doc.json')).toEqual(bytes(9, 8))
    })

    it('does not let later mutation of the caller array change stored bytes', async () => {
      const directory = makeEmpty()
      const written = bytes(1, 2, 3)

      await directory.writeFile('doc.json', written)
      written[0] = 99

      expect(await directory.readFile('doc.json')).toEqual(bytes(1, 2, 3))
    })

    it('does not let mutation of a returned array change stored bytes', async () => {
      const directory = makeEmpty()
      await directory.writeFile('doc.json', bytes(1, 2, 3))

      const first = await directory.readFile('doc.json')
      first?.set([99], 0)

      expect(await directory.readFile('doc.json')).toEqual(bytes(1, 2, 3))
    })

    it('does not throw when removing a path that has no file', async () => {
      const directory = makeEmpty()

      await expect(directory.removeFile('doc.json')).resolves.toBeUndefined()
    })

    it('reads undefined after removing a file', async () => {
      const directory = makeEmpty()
      await directory.writeFile('doc.json', bytes(1, 2, 3))

      await directory.removeFile('doc.json')

      expect(await directory.readFile('doc.json')).toBeUndefined()
    })

    it('lists the immediate child segments directly under the root', async () => {
      const directory = makeEmpty()
      await directory.writeFile('a/p.json', bytes(1))
      await directory.writeFile('a/.house-autosave/x', bytes(2))
      await directory.writeFile('b/p.json', bytes(3))

      expect(new Set(await directory.list(''))).toEqual(new Set(['a', 'b']))
    })

    it('lists the immediate child segments directly under a subdirectory', async () => {
      const directory = makeEmpty()
      await directory.writeFile('a/p.json', bytes(1))
      await directory.writeFile('a/.house-autosave/x', bytes(2))
      await directory.writeFile('b/p.json', bytes(3))

      expect(new Set(await directory.list('a'))).toEqual(new Set(['p.json', '.house-autosave']))
    })

    it('lists the immediate child segments directly under a nested subdirectory', async () => {
      const directory = makeEmpty()
      await directory.writeFile('a/p.json', bytes(1))
      await directory.writeFile('a/.house-autosave/x', bytes(2))
      await directory.writeFile('b/p.json', bytes(3))

      expect(await directory.list('a/.house-autosave')).toEqual(['x'])
    })

    it('lists nothing under the root of an empty directory', async () => {
      const directory = makeEmpty()

      expect(await directory.list('')).toEqual([])
    })

    it('lists nothing for a path that refers to a stored file', async () => {
      const directory = makeEmpty()
      await directory.writeFile('a/doc.json', bytes(1))

      expect(await directory.list('a/doc.json')).toEqual([])
    })

    it('reports no modification time for a path that has no file', async () => {
      const directory = makeEmpty()

      expect(await directory.modifiedAt('doc.json')).toBeUndefined()
    })

    it('reports an ISO time no earlier than the clock before a write', async () => {
      const directory = makeEmpty()
      const clockBefore = roundDownToSecond(Date.now())

      await directory.writeFile('a/doc.json', bytes(1))

      const modified = await directory.modifiedAt('a/doc.json')
      expect(Date.parse(modified ?? '')).toBeGreaterThanOrEqual(clockBefore)
    })

    it('reports a time no earlier than before when the file is written again', async () => {
      const directory = makeEmpty()
      await directory.writeFile('doc.json', bytes(1))
      const first = await directory.modifiedAt('doc.json')

      await directory.writeFile('doc.json', bytes(2))

      const second = await directory.modifiedAt('doc.json')
      expect(Date.parse(second ?? '')).toBeGreaterThanOrEqual(Date.parse(first ?? ''))
    })

    it('reports no modification time again after the file is removed', async () => {
      const directory = makeEmpty()
      await directory.writeFile('doc.json', bytes(1))

      await directory.removeFile('doc.json')

      expect(await directory.modifiedAt('doc.json')).toBeUndefined()
    })

    it('reports no modification time for a path that is a directory', async () => {
      const directory = makeEmpty()
      await directory.writeFile('d/x', bytes(1))

      expect(await directory.modifiedAt('d')).toBeUndefined()
    })

    describeRemovingATree(makeEmpty)
    describeRemovingAtAFile(makeEmpty)
    describeRemovingFileAtAPrefix(makeEmpty)
  })
}

const MILLISECONDS_PER_SECOND = 1000

/** A file system may keep whole seconds only, so the lower bound is rounded down too. */
function roundDownToSecond(milliseconds: number): number {
  return Math.floor(milliseconds / MILLISECONDS_PER_SECOND) * MILLISECONDS_PER_SECOND
}

function describeRemovingATree(makeEmpty: () => DirectoryPort): void {
  const bytes = (...values: number[]) => Uint8Array.from(values)

  describe('removing a tree', () => {
    const seeded = async () => {
      const directory = makeEmpty()
      await directory.writeFile('a/x', bytes(1))
      await directory.writeFile('a/deep/y', bytes(2))
      await directory.writeFile('ab/z', bytes(3))
      await directory.writeFile('a.txt', bytes(4))
      return directory
    }

    it('removes every file under the prefix and nothing that only shares its spelling', async () => {
      const directory = await seeded()

      await directory.removeTree('a')

      expect(await directory.list('a')).toEqual([])
      expect(await directory.readFile('a/x')).toBeUndefined()
      expect(await directory.modifiedAt('a/x')).toBeUndefined()
      expect(await directory.readFile('ab/z')).toEqual(bytes(3))
      expect(await directory.readFile('a.txt')).toEqual(bytes(4))
    })

    it('removes only the named subtree', async () => {
      const directory = await seeded()

      await directory.removeTree('a/deep')

      expect(await directory.readFile('a/deep/y')).toBeUndefined()
      expect(await directory.readFile('a/x')).toEqual(bytes(1))
    })

    it('resolves without error for a prefix that holds no files', async () => {
      const directory = await seeded()

      await expect(directory.removeTree('missing')).resolves.toBeUndefined()

      expect(await directory.readFile('a/x')).toEqual(bytes(1))
    })
  })
}

/** `removeFile` removes a file only: a path that is the prefix of other files leaves them alone. */
function describeRemovingFileAtAPrefix(makeEmpty: () => DirectoryPort): void {
  const bytes = (...values: number[]) => Uint8Array.from(values)

  describe('removing a file at a path that is the prefix of other files', () => {
    it('resolves and keeps the files under the prefix', async () => {
      const directory = makeEmpty()
      await directory.writeFile('a/b', bytes(5, 6))

      await expect(directory.removeFile('a')).resolves.toBeUndefined()

      expect(await directory.readFile('a/b')).toEqual(bytes(5, 6))
    })
  })
}

/** The port states that a file at the prefix itself stays: `removeTree` removes a directory only. */
function describeRemovingAtAFile(makeEmpty: () => DirectoryPort): void {
  const bytes = (...values: number[]) => Uint8Array.from(values)

  describe('removing a tree at a path that is a file', () => {
    it('keeps the file at the prefix and a sibling file whose name starts the same, and resolves', async () => {
      const directory = makeEmpty()
      await directory.writeFile('a', bytes(1, 2))
      await directory.writeFile('ab', bytes(3))

      await expect(directory.removeTree('a')).resolves.toBeUndefined()

      expect(await directory.readFile('a')).toEqual(bytes(1, 2))
      expect(await directory.readFile('ab')).toEqual(bytes(3))
    })

    it('keeps a file inside a directory when the prefix names that file', async () => {
      const directory = makeEmpty()
      await directory.writeFile('a/b', bytes(5, 6))
      await directory.writeFile('a/c', bytes(7))

      await expect(directory.removeTree('a/b')).resolves.toBeUndefined()

      expect(await directory.readFile('a/b')).toEqual(bytes(5, 6))
      expect(await directory.readFile('a/c')).toEqual(bytes(7))
    })
  })
}
