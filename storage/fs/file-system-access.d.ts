export {}

/** Read or read-write access requested for a File System Access handle. */
interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite'
}

/** Options accepted by window.showDirectoryPicker. */
interface DirectoryPickerOptions {
  mode?: 'read' | 'readwrite'
}

declare global {
  // The File System Access async-iterator methods are not in this project's TS
  // lib yet, so we augment the handle interface with the surface this code uses.
  interface FileSystemDirectoryHandle {
    keys(): AsyncIterableIterator<string>
    values(): AsyncIterableIterator<FileSystemDirectoryHandle | FileSystemFileHandle>
    entries(): AsyncIterableIterator<[string, FileSystemDirectoryHandle | FileSystemFileHandle]>
  }

  // The permission-query methods are part of the File System Access spec but are
  // not yet in this project's TS lib, so we augment the base handle interface.
  interface FileSystemHandle {
    queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
    requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
  }

  // The native folder picker is likewise absent from the current TS lib.
  interface Window {
    showDirectoryPicker(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>
  }
}
