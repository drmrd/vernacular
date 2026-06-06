export {}

declare global {
  // The File System Access async-iterator methods are not in this project's TS
  // lib yet, so we augment the handle interface with the surface this code uses.
  interface FileSystemDirectoryHandle {
    keys(): AsyncIterableIterator<string>
    values(): AsyncIterableIterator<FileSystemDirectoryHandle | FileSystemFileHandle>
    entries(): AsyncIterableIterator<[string, FileSystemDirectoryHandle | FileSystemFileHandle]>
  }
}
