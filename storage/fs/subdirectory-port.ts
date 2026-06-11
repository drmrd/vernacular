import type { DirectoryPort } from './directory-port'

/**
 * A DirectoryPort view rooted at `prefix` inside another DirectoryPort. Every
 * operation forwards to `root` with `prefix/` prepended, so a store written
 * against the root path `vernacular.json` reads and writes `prefix/vernacular.json`.
 * This lets one FolderProjectStore operate inside a per-project subdirectory.
 */
export class SubdirectoryPort implements DirectoryPort {
  constructor(
    private readonly root: DirectoryPort,
    private readonly prefix: string,
  ) {}

  private prefixed(path: string): string {
    return path === '' ? this.prefix : `${this.prefix}/${path}`
  }

  readFile(path: string): Promise<Uint8Array | undefined> {
    return this.root.readFile(this.prefixed(path))
  }

  writeFile(path: string, bytes: Uint8Array): Promise<void> {
    return this.root.writeFile(this.prefixed(path), bytes)
  }

  removeFile(path: string): Promise<void> {
    return this.root.removeFile(this.prefixed(path))
  }

  list(prefix: string): Promise<string[]> {
    return this.root.list(this.prefixed(prefix))
  }
}
