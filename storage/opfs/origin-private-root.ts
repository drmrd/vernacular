/**
 * The one place that asks the browser for the root of the origin private file system.
 * It is async so that a host with no `navigator.storage` gives a rejected promise
 * rather than a synchronous throw, which lets callers handle both failures alike.
 */
export async function originPrivateRoot(): Promise<FileSystemDirectoryHandle> {
  return navigator.storage.getDirectory()
}
