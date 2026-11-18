import type { DirectoryPort } from '../fs/directory-port'

async function collect(
  directory: DirectoryPort,
  path: string,
  found: Map<string, Uint8Array>,
): Promise<void> {
  const bytes = path === '' ? undefined : await directory.readFile(path)
  if (bytes !== undefined) {
    found.set(path, bytes)
    return
  }
  for (const name of await directory.list(path)) {
    await collect(directory, path === '' ? name : `${path}/${name}`, found)
  }
}

/** Every file under the directory, keyed by its path relative to it. */
export async function listStoredFiles(
  directory: DirectoryPort,
): Promise<ReadonlyMap<string, Uint8Array>> {
  const found = new Map<string, Uint8Array>()
  await collect(directory, '', found)
  return found
}
