import type { DirectoryPort } from './directory-port'

interface SplitPath {
  dirs: string[]
  name: string
}

/** True for the errors that mean no entry is there, or not an entry of the kind asked for. */
function isAbsentEntry(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'NotFoundError' || error.name === 'TypeMismatchError')
  )
}

/**
 * DirectoryPort over the File System Access API. Backs the durable OPFS store
 * and any user-granted folder handle. Paths are forward-slash with no leading
 * slash, matching the DirectoryPort contract. removeTree removes a directory with everything
 * under it and leaves a file at its path alone. removeFile removes a file and leaves a directory at
 * its path alone, empty or not.
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
        // A missing or non-directory segment on a read walk is an absent path.
        if (!options.create && isAbsentEntry(error)) {
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
      if (isAbsentEntry(error)) {
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
      // Asking for a file handle first keeps a directory out of reach: the non-recursive removal
      // would take an empty directory or reject for a full one.
      await dir.getFileHandle(name)
      await dir.removeEntry(name)
    } catch (error) {
      // Removing an absent file, or a path that names a directory, is a no-op per the contract.
      if (isAbsentEntry(error)) {
        return
      }
      throw error
    }
  }

  async removeTree(prefix: string): Promise<void> {
    const { dirs, name } = this.split(prefix)
    const parent = await this.resolveDir(dirs, { create: false })
    if (parent === undefined) {
      return
    }
    try {
      // Asking for a directory handle tells the kinds apart: a file at the path answers with a
      // type mismatch, and nothing at the path answers not found. Either way there is no tree.
      await parent.getDirectoryHandle(name)
      await parent.removeEntry(name, { recursive: true })
    } catch (error) {
      if (isAbsentEntry(error)) {
        return
      }
      throw error
    }
  }

  async modifiedAt(path: string): Promise<string | undefined> {
    const { dirs, name } = this.split(path)
    const dir = await this.resolveDir(dirs, { create: false })
    if (dir === undefined) {
      return undefined
    }
    try {
      const file = await (await dir.getFileHandle(name)).getFile()
      return new Date(file.lastModified).toISOString()
    } catch (error) {
      // A missing entry, or a directory at the path, is no file.
      if (isAbsentEntry(error)) {
        return undefined
      }
      throw error
    }
  }

  async list(prefix: string): Promise<string[]> {
    const segments = prefix === '' ? [] : prefix.split('/')
    // A prefix that names a file resolves as absent; the contract reports a
    // file as having no children.
    const dir = await this.resolveDir(segments, { create: false })
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
