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

      expect(await directory.readFile('project.json')).toBeUndefined()
    })

    it('reads back byte-equal content after a write', async () => {
      const directory = makeEmpty()

      await directory.writeFile('project.json', bytes(1, 2, 3))

      const read = await directory.readFile('project.json')
      expect(read).toEqual(bytes(1, 2, 3))
    })

    it('overwrites the file when writing the same path twice', async () => {
      const directory = makeEmpty()

      await directory.writeFile('project.json', bytes(1, 2, 3))
      await directory.writeFile('project.json', bytes(9, 8))

      expect(await directory.readFile('project.json')).toEqual(bytes(9, 8))
    })

    it('does not let later mutation of the caller array change stored bytes', async () => {
      const directory = makeEmpty()
      const written = bytes(1, 2, 3)

      await directory.writeFile('project.json', written)
      written[0] = 99

      expect(await directory.readFile('project.json')).toEqual(bytes(1, 2, 3))
    })

    it('does not let mutation of a returned array change stored bytes', async () => {
      const directory = makeEmpty()
      await directory.writeFile('project.json', bytes(1, 2, 3))

      const first = await directory.readFile('project.json')
      first?.set([99], 0)

      expect(await directory.readFile('project.json')).toEqual(bytes(1, 2, 3))
    })

    it('does not throw when removing a path that has no file', async () => {
      const directory = makeEmpty()

      await expect(directory.removeFile('project.json')).resolves.toBeUndefined()
    })

    it('reads undefined after removing a file', async () => {
      const directory = makeEmpty()
      await directory.writeFile('project.json', bytes(1, 2, 3))

      await directory.removeFile('project.json')

      expect(await directory.readFile('project.json')).toBeUndefined()
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
      await directory.writeFile('a/project.json', bytes(1))

      expect(await directory.list('a/project.json')).toEqual([])
    })
  })
}
