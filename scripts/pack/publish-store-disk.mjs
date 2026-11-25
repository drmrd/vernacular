import { mkdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { CATALOG_FILE } from '../../core/assets/store-paths.ts'

/** @param {string} path */
async function readStoredFile(path) {
  try {
    return await readFile(path)
  } catch (cause) {
    if (cause.code === 'ENOENT') return undefined
    throw cause
  }
}

/** @param {string} storeDir @param {string} lockDir */
async function lockStore(storeDir, lockDir) {
  await mkdir(storeDir, { recursive: true })
  try {
    await mkdir(lockDir)
  } catch (cause) {
    if (cause.code !== 'EEXIST') throw cause
    throw new Error(
      `Store busy at ${lockDir}. Retry when the publish finishes. If it was interrupted, verify no publisher is running before removing the lock directory.`,
      { cause },
    )
  }
}

/**
 * @param {string} storeDir
 * @param {(io: import('./publish-store.mjs').PublishFiles) => Promise<void>} publish
 */
export async function withStoreWriter(storeDir, publish) {
  const lockDir = join(storeDir, '.publish-lock')
  const temporaryFile = join(lockDir, 'pending')
  const catalog = join(storeDir, CATALOG_FILE)
  const created = []
  await lockStore(storeDir, lockDir)
  try {
    await publish({
      readFile: readStoredFile,
      async writeFile(path, bytes) {
        await mkdir(dirname(path), { recursive: true })
        await writeFile(temporaryFile, bytes, { flag: 'wx' })
        // The store lock covers the publisher's check for existing immutable files.
        await rename(temporaryFile, path)
        if (path !== catalog) created.push(path)
      },
    })
  } catch (cause) {
    for (const path of created) await unlink(path)
    throw cause
  } finally {
    await rm(lockDir, { recursive: true, force: true })
  }
}
