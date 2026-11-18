import type { DirectoryPort } from './directory-port'

/**
 * Map-backed DirectoryPort for tests and the folder-codec contract. Bytes are
 * copied in on write and out on read so callers cannot mutate stored state
 * through a shared array reference. The clock is injectable so tests can fix
 * the time each write records.
 */
export class InMemoryDirectory implements DirectoryPort {
  private readonly files = new Map<string, Uint8Array>()
  private readonly modifiedTimes = new Map<string, string>()
  private readonly now: () => Date

  constructor(options: { now?: () => Date } = {}) {
    this.now = options.now ?? (() => new Date())
  }

  async readFile(path: string): Promise<Uint8Array | undefined> {
    const bytes = this.files.get(path)
    return bytes === undefined ? undefined : bytes.slice()
  }

  async writeFile(path: string, bytes: Uint8Array): Promise<void> {
    this.files.set(path, bytes.slice())
    this.modifiedTimes.set(path, this.now().toISOString())
  }

  async removeFile(path: string): Promise<void> {
    this.files.delete(path)
    this.modifiedTimes.delete(path)
  }

  async removeTree(prefix: string): Promise<void> {
    const directoryPath = `${prefix}/`
    for (const key of [...this.files.keys()]) {
      if (key.startsWith(directoryPath)) {
        this.files.delete(key)
        this.modifiedTimes.delete(key)
      }
    }
  }

  async modifiedAt(path: string): Promise<string | undefined> {
    return this.modifiedTimes.get(path)
  }

  async list(prefix: string): Promise<string[]> {
    const directoryPath = prefix === '' ? '' : `${prefix}/`
    const children = new Set<string>()
    for (const key of this.files.keys()) {
      if (!key.startsWith(directoryPath)) {
        continue
      }
      const rest = key.slice(directoryPath.length)
      const slashIndex = rest.indexOf('/')
      const firstSegment = slashIndex === -1 ? rest : rest.slice(0, slashIndex)
      if (firstSegment !== '') {
        children.add(firstSegment)
      }
    }
    return [...children]
  }
}
