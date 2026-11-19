import { useCallback } from 'react'
import { importFile } from '../session'
import { failureMessage } from './failure-message'
import { useSwitchFlow } from './project-action-helpers'
import type { ProjectActionsContext } from './use-project-actions'

// Reads the bytes through the file's own reader, so a file that cannot be read rejects with its
// own error. A File with no such reader (the test environment's) is read through a FileReader.
function readFileBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer().then((buffer) => new Uint8Array(buffer))
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(new Uint8Array(reader.result as ArrayBuffer)))
    reader.addEventListener('error', () => reject(reader.error))
    reader.readAsArrayBuffer(file)
  })
}

// Opens a hidden file input scoped to the supported project extensions, then routes
// the first chosen file through the import callback. The picker is DOM glue; tests
// drive the import callback directly.
function openFilePicker(onFile: (file: File) => void | Promise<void>): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.building,.json,application/json'
  input.addEventListener('change', () => {
    const file = input.files?.[0]
    if (file) {
      void onFile(file)
    }
  })
  input.click()
}

// Reads the bytes of the file first, outside the flow, so a file that cannot be read shows why and
// runs no flow. The import then opens the copy under a new id and stores it. A failure shows
// "Open failed: " with the reason, with no Retry.
export function useOpenFileAction(context: ProjectActionsContext): {
  onImportDroppedFile: (file: File) => Promise<void>
  onOpenFile: () => void
} {
  const { notifications } = context
  const runSwitch = useSwitchFlow(context)
  const importAndActivate = useCallback(
    async (file: File) => {
      let bytes: Uint8Array
      try {
        bytes = await readFileBytes(file)
      } catch (error) {
        notifications.error(failureMessage('Open', error))
        return
      }
      const name = file.name
      await runSwitch((ports, current) => importFile(ports, current, { name, bytes }))
    },
    [runSwitch, notifications],
  )
  return {
    onImportDroppedFile: importAndActivate,
    onOpenFile: () => openFilePicker(importAndActivate),
  }
}
