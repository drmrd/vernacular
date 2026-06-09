import { deserializeClipboard, serializeClipboard, type ClipboardSnapshot } from '../../core'

function getSystemClipboard(): Clipboard | undefined {
  return globalThis.navigator?.clipboard
}

export async function writeSystemClipboard(snapshot: ClipboardSnapshot): Promise<void> {
  const clipboard = getSystemClipboard()
  if (clipboard === undefined) {
    return
  }

  try {
    await clipboard.writeText(serializeClipboard(snapshot))
  } catch {
    // Clipboard write permission can be denied by the browser. The in-app
    // clipboard store is the fallback, so a rejection here is non-fatal.
  }
}

export async function readSystemClipboard(): Promise<ClipboardSnapshot | undefined> {
  const clipboard = getSystemClipboard()
  if (clipboard === undefined) {
    return undefined
  }

  try {
    const text = await clipboard.readText()
    return deserializeClipboard(text)
  } catch {
    // Clipboard read permission can be denied by the browser. The in-app
    // clipboard store is the fallback, so a rejection means "nothing to paste".
    return undefined
  }
}
