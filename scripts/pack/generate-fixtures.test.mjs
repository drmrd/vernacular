// @vitest-environment node
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { writeBrokenPack, writeWellFormedPack } from './generate-fixtures.mjs'

const fixturesRoot = fileURLToPath(new URL('../../tests/fixtures/packs/', import.meta.url))

const fixturePacks = [
  { packDirectory: 'vernacular-starter-1.0.0', build: writeWellFormedPack },
  { packDirectory: 'broken-pack-wrong', build: writeBrokenPack },
]

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
    .map((entry) => relative(fixturesRoot, join(entry.parentPath, entry.name)))
    .sort()
}

describe('the fixture generator', () => {
  it('reproduces the committed fixture packs byte for byte, styles included', async () => {
    for (const { packDirectory, build } of fixturePacks) {
      const sink = memorySink()
      await build(sink)

      expect([...sink.files.keys()].sort()).toEqual(await committedFilePaths(packDirectory))
      for (const [relativePath, bytes] of sink.files) {
        const committed = await readFile(join(fixturesRoot, relativePath))
        expect(bytes.equals(committed), `${relativePath} differs from the committed fixture`).toBe(
          true,
        )
      }
    }
  })
})
