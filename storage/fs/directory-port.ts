/**
 * Flat, path-keyed async file surface. Paths use forward slashes and no leading
 * slash (for example `project.json`, `.house-autosave/snapshot.json`,
 * `<id>/project.json`). The single seam durable stores read and write through,
 * so the folder codec is testable against an in-memory fake.
 */
export interface DirectoryPort {
  /** Bytes at `path`, or undefined when no file exists there. */
  readFile(path: string): Promise<Uint8Array | undefined>
  /** Write bytes at `path`, creating parent directories as needed. */
  writeFile(path: string, bytes: Uint8Array): Promise<void>
  /** Remove the file at `path`; a no-op when absent. */
  removeFile(path: string): Promise<void>
  /**
   * Immediate child segment names directly under directory `prefix` (use `''`
   * for the root). For keys `a/p.json`, `a/.house-autosave/x`, `b/p.json`:
   * list('') -> ['a','b']; list('a') -> ['p.json','.house-autosave'];
   * list('a/.house-autosave') -> ['x']. Order is not guaranteed.
   */
  list(prefix: string): Promise<string[]>
}
