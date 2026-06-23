import { FileSystemDirectory, type DirectoryPort } from '../storage'

/**
 * Capability probing only feature-detects the OPFS API surface, but some hosts
 * expose `getDirectory` as a function while rejecting at call time (notably some
 * WebKit builds, which throw an UnknownError). Verify the root directory actually
 * resolves before booting against OPFS so such hosts fall back to IndexedDB rather
 * than failing to open the project.
 */
export async function opfsUsable(): Promise<boolean> {
  try {
    await navigator.storage.getDirectory()
    return true
  } catch {
    return false
  }
}

/** Build the OPFS root directory the OPFS-backed stores boot against. */
export async function opfsRootDirectory(): Promise<DirectoryPort> {
  return new FileSystemDirectory(await navigator.storage.getDirectory())
}
