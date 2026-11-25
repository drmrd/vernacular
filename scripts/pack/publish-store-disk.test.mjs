// @vitest-environment node
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { expect, it, vi } from 'vitest'
import { withStoreWriter } from './publish-store-disk.mjs'
import { publishPackToDisk } from './publish-store.mjs'

const LEGACY_PACK = fileURLToPath(
  new URL('../../public/packs/vernacular-starter-1.0.0', import.meta.url),
)
const FURNITURE_PACK = fileURLToPath(
  new URL('../../tests/fixtures/packs/example-furniture-1.0.0', import.meta.url),
)
const LEGACY_BLOB = '8a8a0cafbecb2446278c8b61e275c1ac78373a7ccd59ddd5ac7684bf1388341e'
const SOFA_BLOB = '821078871bb03179c9a328f30a2152a56f568584d579fc6e3ea1213462a2b0e3'

async function expectLockAndReadBehavior(storeDir, io, missingPath) {
  const contender = vi.fn()
  await expect(withStoreWriter(storeDir, contender)).rejects.toThrow(/busy|lock|in progress/i)
  expect(contender).not.toHaveBeenCalled()
  await expect(io.readFile(missingPath)).resolves.toBeUndefined()
  await expect(io.readFile(join(storeDir, 'blobs'))).rejects.toMatchObject({ code: 'EISDIR' })
}

it('rolls back a new blob after a later disk write fails', async () => {
  const storeDir = await mkdtemp(join(tmpdir(), 'vernacular-publish-rollback-'))
  try {
    await publishPackToDisk({ packDir: LEGACY_PACK, storeDir })
    const catalogPath = join(storeDir, 'catalog.json')
    const retainedPath = join(storeDir, 'blobs', 'sha256', LEGACY_BLOB)
    const newBlobPath = join(storeDir, 'blobs', 'sha256', SOFA_BLOB)
    const catalogBefore = await readFile(catalogPath)
    const retainedBytes = await readFile(retainedPath)
    const sofaBytes = await readFile(join(FURNITURE_PACK, 'assets', SOFA_BLOB + '.glb'))
    const pathsBefore = (await readdir(storeDir, { recursive: true })).sort()

    await expect(
      withStoreWriter(storeDir, async (io) => {
        await expectLockAndReadBehavior(storeDir, io, newBlobPath)
        await io.writeFile(newBlobPath, sofaBytes)
        expect((await readFile(newBlobPath)).equals(sofaBytes)).toBe(true)
        await io.writeFile(join(retainedPath, 'blocked'), sofaBytes)
      }),
    ).rejects.toThrow(/\b(?:EEXIST|ENOTDIR)\b/)

    expect((await readFile(catalogPath)).equals(catalogBefore)).toBe(true)
    expect((await readFile(retainedPath)).equals(retainedBytes)).toBe(true)
    await expect(readFile(newBlobPath)).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await readdir(storeDir, { recursive: true })).sort()).toEqual(pathsBefore)

    await publishPackToDisk({ packDir: FURNITURE_PACK, storeDir })
    expect((await readFile(newBlobPath)).equals(sofaBytes)).toBe(true)
    const catalog = JSON.parse(await readFile(catalogPath, 'utf8'))
    expect(catalog.packs.map(({ packId, version }) => [packId, version])).toEqual([
      ['example-furniture', '1.0.0'],
      ['vernacular-starter', '1.0.0'],
    ])
  } finally {
    await rm(storeDir, { recursive: true, force: true })
  }
})
