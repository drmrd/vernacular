// @vitest-environment node
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { FIXTURE_PACKS } from './generate-fixtures.mjs'

const fixturesRoot = fileURLToPath(new URL('../../tests/fixtures/packs/', import.meta.url))

/** In-memory sink: records every file a builder writes, keyed by path under the packs root. */
function memorySink() {
  const files = new Map()
  return {
    files,
    async writeFile(relativePath, bytes) {
      files.set(relativePath, Buffer.from(bytes))
    },
  }
}

async function committedFilePaths(packDirectory) {
  const entries = await readdir(join(fixturesRoot, packDirectory), {
    recursive: true,
    withFileTypes: true,
  })
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(fixturesRoot, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort()
}

describe('the fixture generator', () => {
  it.each(FIXTURE_PACKS)(
    'reproduces the committed $directory pack byte for byte, styles included',
    async ({ directory, write }) => {
      const sink = memorySink()
      await write(sink)

      expect([...sink.files.keys()].sort()).toEqual(await committedFilePaths(directory))
      for (const [relativePath, bytes] of sink.files) {
        const committed = await readFile(join(fixturesRoot, relativePath))
        if (relativePath.endsWith('.json')) {
          expect(bytes.toString('utf8'), relativePath).toBe(committed.toString('utf8'))
        } else {
          expect(
            bytes.equals(committed),
            `${relativePath} differs from the committed fixture`,
          ).toBe(true)
        }
      }
    },
  )
})
