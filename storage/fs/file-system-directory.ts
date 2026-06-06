import type { DirectoryPort } from './directory-port'

interface SplitPath {
  dirs: string[]
  name: string
}

function isNotFound(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError'
}

/**
 * DirectoryPort over the File System Access API. Backs the durable OPFS store
 * and any user-granted folder handle. Paths are forward-slash with no leading
 * slash, matching the DirectoryPort contract.
 */
export class FileSystemDirectory implements DirectoryPort {
  constructor(private readonly root: FileSystemDirectoryHandle) {}

  private split(path: string): SplitPath {
    const segments = path.split('/')
    const name = segments.pop() ?? ''
    return { dirs: segments, name }
  }

  private async resolveDir(
    segments: string[],
    options: { create: boolean },
  ): Promise<FileSystemDirectoryHandle | undefined> {
    let dir = this.root
    for (const segment of segments) {
      try {
        dir = await dir.getDirectoryHandle(segment, { create: options.create })
      } catch (error) {
        // A missing segment on a read walk is an absent path, not a failure.
        if (!options.create && isNotFound(error)) {
          return undefined
        }
        throw error
      }
    }
    return dir
  }

  async readFile(path: string): Promise<Uint8Array | undefined> {
    const { dirs, name } = this.split(path)
    const dir = await this.resolveDir(dirs, { create: false })
    if (dir === undefined) {
      return undefined
    }
    let handle: FileSystemFileHandle
    try {
      handle = await dir.getFileHandle(name)
    } catch (error) {
      // Absent file reads as undefined; other failures propagate.
      if (isNotFound(error)) {
        return undefined
      }
      throw error
    }
    const file = await handle.getFile()
    return new Uint8Array(await file.arrayBuffer())
  }

  async writeFile(path: string, bytes: Uint8Array): Promise<void> {
    const { dirs, name } = this.split(path)
    const dir = await this.resolveDir(dirs, { create: true })
    // resolveDir with create:true always returns a handle.
    const handle = await dir!.getFileHandle(name, { create: true })
    const writable = await handle.createWritable()
    // The DOM write chunk type wants an ArrayBuffer-backed view, while the
    // DirectoryPort contract's Uint8Array is the wider ArrayBufferLike variant.
    // These bytes are always ArrayBuffer-backed, so narrow the view for the API.
    await writable.write(bytes as Uint8Array<ArrayBuffer>)
    await writable.close()
  }

  async removeFile(path: string): Promise<void> {
    const { dirs, name } = this.split(path)
    const dir = await this.resolveDir(dirs, { create: false })
    if (dir === undefined) {
      return
    }
    try {
      await dir.removeEntry(name)
    } catch (error) {
      // Removing an absent file is a no-op per the DirectoryPort contract.
      if (isNotFound(error)) {
        return
      }
      throw error
    }
  }

  async list(prefix: string): Promise<string[]> {
    const segments = prefix === '' ? [] : prefix.split('/')
    let dir: FileSystemDirectoryHandle | undefined
    try {
      dir = await this.resolveDir(segments, { create: false })
    } catch (error) {
      // A prefix that names a file resolves to a TypeMismatchError; the contract
      // reports a file as having no children.
      if (error instanceof DOMException) {
        return []
      }
      throw error
    }
    if (dir === undefined) {
      return []
    }
    const names: string[] = []
    for await (const name of dir.keys()) {
      names.push(name)
    }
    return names
  }
}
