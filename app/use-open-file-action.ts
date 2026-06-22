import { useCallback } from 'react'
import { commitProject, createEditorSession, guardDestructive } from '../bridge'
import { importProjectFile } from '../storage'
import { humanMessage } from '../editor/design-system'
import { validateLoadedProject } from './validate-loaded-project'
import {
  defaultStoreBackend,
  recordRecent,
  type ProjectActionsContext,
} from './use-project-actions'

// Reads the file's bytes through a FileReader, which both browsers and the jsdom
// test File implement (jsdom's Blob exposes no async byte readers).
function readFileBytes(file: File): Promise<Uint8Array> {
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

export function useOpenFileAction(context: ProjectActionsContext): {
  onImportDroppedFile: (file: File) => Promise<void>
  onOpenFile: () => void
} {
  const { store, projectId, recentProjects, capabilities, onSession, isDirty } = context
  const { confirmDiscard, notifications } = context
  const backend = defaultStoreBackend(capabilities)
  const importAndActivate = useCallback(
    (file: File) =>
      guardDestructive({
        isDirty: isDirty ?? false,
        confirm: confirmDiscard ?? (() => true),
        run: async () => {
          try {
            const bytes = await readFileBytes(file)
            const project = await importProjectFile(file.name, bytes, projectId)
            validateLoadedProject(project)
            onSession(createEditorSession(project))
            await commitProject({ store, projectId, project })
            if (backend !== null) {
              recordRecent(recentProjects, { id: projectId, name: project.meta.name, backend })
            }
          } catch (error) {
            notifications.error(`Couldn't open ${file.name}: ${humanMessage(error)}`)
          }
        },
      }),
    [store, projectId, recentProjects, backend, onSession, isDirty, confirmDiscard, notifications],
  )
  return {
    onImportDroppedFile: importAndActivate,
    onOpenFile: () => openFilePicker(importAndActivate),
  }
}
