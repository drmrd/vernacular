import { useCallback, useRef, useState, type ChangeEvent, type ReactElement } from 'react'

import type { LibraryItem, UserSource } from '../../storage'
import { useUserAssetSource } from '../../bridge/react/user-asset-source-context'
import { humanMessage, useNotifications, type PromiseMessages } from '../design-system'

import { useActiveTool, type ToolId } from '../tools/active-tool-context'
import { useFurniturePlacement } from '../plan/furniture-placement-context'

import { importFurnitureGlb } from './use-furniture-import'
import { LibraryLauncher } from './library-launcher'

const PLACE_FURNITURE_TOOL: ToolId = 'place-furniture'

// Toast copy for one import attempt. The failure text follows the shared
// "<Action> failed: <reason>" convention the file-action hooks use.
function importMessages(fileName: string): PromiseMessages<LibraryItem> {
  return {
    pending: `Importing ${fileName}...`,
    success: (item) => `Imported ${item.name}`,
    error: (error) => `Import failed: ${humanMessage(error)}`,
  }
}

interface LibraryImport {
  canImport: boolean
  libraryRevision: number
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void
}

// Drives a chosen file through the import: one toast carries pending, success,
// and failure, and a successful put bumps the revision so the open panel lists
// the registry again instead of showing yesterday's items.
function useLibraryImport(userSource: UserSource | null): LibraryImport {
  const notifications = useNotifications()
  const [libraryRevision, setLibraryRevision] = useState(0)

  const runImport = useCallback(
    async (file: File, source: UserSource): Promise<void> => {
      try {
        await notifications.promise(importFurnitureGlb(file, source), importMessages(file.name))
        setLibraryRevision((revision) => revision + 1)
      } catch {
        // The promise toast already carried the failure to the user, and the
        // panel keeps the items it had.
      }
    },
    [notifications],
  )

  const onFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      // Clear the value so re-choosing the same file fires change again.
      event.target.value = ''
      if (file === undefined || userSource === null) {
        return
      }
      // runImport reports every outcome on its own toast and never rejects.
      void runImport(file, userSource)
    },
    [runImport, userSource],
  )

  return { canImport: userSource !== null, libraryRevision, onFileChange }
}

// The connected host for the furniture library launcher, mounted in the tool
// rail. Picking an item arms it and switches to the place-furniture tool so the
// next canvas click drops it; the import button reads a chosen model into the
// user's asset source. The list and the user source are provided at app boot;
// without the user source the import action stays disabled.
export function LibraryLauncherPanel(): ReactElement {
  const { armItem, armed } = useFurniturePlacement()
  const { tool, setTool } = useActiveTool()
  const userSource = useUserAssetSource()
  const { canImport, libraryRevision, onFileChange } = useLibraryImport(userSource)
  const inputRef = useRef<HTMLInputElement>(null)

  const onPick = useCallback(
    (item: LibraryItem) => {
      armItem(item)
      setTool(PLACE_FURNITURE_TOOL)
    },
    [armItem, setTool],
  )

  const onImport = useCallback(() => {
    inputRef.current?.click()
  }, [])

  // The armed item outlives a tool switch, so that a return to the tool resumes
  // where the user left off. Only the tool that consumes it should say so: under
  // any other tool the canvas will not place it, and the panel stays quiet.
  const itemAwaitingPlacement = tool === PLACE_FURNITURE_TOOL ? armed : null

  return (
    <>
      <LibraryLauncher
        onPick={onPick}
        onImport={onImport}
        armed={itemAwaitingPlacement}
        canImport={canImport}
        libraryRevision={libraryRevision}
      />
      <input
        ref={inputRef}
        type="file"
        accept=".glb,model/gltf-binary"
        hidden
        aria-hidden="true"
        onChange={onFileChange}
      />
    </>
  )
}
