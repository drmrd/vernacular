// @vitest-environment node
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { FIXTURE_PACKS } from './generate-fixtures.mjs'
import { publishPackToDisk } from './publish-store.mjs'

const fixturesRoot = fileURLToPath(new URL('../../tests/fixtures/packs/', import.meta.url))
const bundledPacksRoot = fileURLToPath(new URL('../../public/packs/', import.meta.url))
const committedStore = fileURLToPath(new URL('../../tests/fixtures/store/', import.meta.url))
const storePacks = [
  join(bundledPacksRoot, 'vernacular-starter-1.0.0'),
  join(bundledPacksRoot, 'vernacular-starter-1.1.1'),
  join(fixturesRoot, 'example-furniture-1.0.0'),
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

async function filePaths(directory, relativeTo = directory) {
  const entries = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  })
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(relativeTo, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort()
}

async function seedStaleFixtureBlob(storeDir) {
  const bytes = Buffer.from('previous fixture blob')
  const digest = createHash('sha256').update(bytes).digest('hex')
  const blobDir = join(storeDir, 'blobs', 'sha256')
  await mkdir(blobDir, { recursive: true })
  await writeFile(join(blobDir, digest), bytes)
}

async function expectSameStore(actualDir, expectedDir) {
  const paths = await filePaths(expectedDir)
  await expect(filePaths(actualDir), actualDir).resolves.toEqual(paths)
  for (const path of paths) {
    const [actual, expected] = await Promise.all([
      readFile(join(actualDir, path)),
      readFile(join(expectedDir, path)),
    ])
    expect(actual.equals(expected), `${path} differs in ${actualDir}`).toBe(true)
  }
}

describe('the fixture generator', () => {
  it.each(FIXTURE_PACKS)(
    'reproduces the committed $directory pack byte for byte, styles included',
    async ({ directory, write }) => {
      const sink = memorySink()
      await write(sink)

      expect([...sink.files.keys()].sort()).toEqual(
        await filePaths(join(fixturesRoot, directory), fixturesRoot),
      )
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

  it('the committed fixture store is the publish of the fixture packs', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'vernacular-fixture-store-'))
    try {
      const publishedStore = join(temporaryRoot, 'published')
      for (const packDir of storePacks) {
        await publishPackToDisk({ packDir, storeDir: publishedStore, name: 'Example Library' })
      }
      await expectSameStore(committedStore, publishedStore)

      const { generateFixtureStore } = await import('./generate-fixtures.mjs')
      const generatedStore = join(temporaryRoot, 'generated')
      await seedStaleFixtureBlob(generatedStore)
      await generateFixtureStore(generatedStore)
      await expectSameStore(generatedStore, publishedStore)
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true })
    }
  })
})
