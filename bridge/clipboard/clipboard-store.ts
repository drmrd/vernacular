import type { ClipboardSnapshot } from '../../core'

export interface ClipboardStore {
  read(): ClipboardSnapshot | undefined
  write(snapshot: ClipboardSnapshot): void
}

export function createClipboardStore(): ClipboardStore {
  let snapshot: ClipboardSnapshot | undefined

  return {
    read: () => snapshot,
    write: (next) => {
      snapshot = next
    },
  }
}
