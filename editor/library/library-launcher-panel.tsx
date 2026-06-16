import { useCallback, useRef, type ChangeEvent, type ReactElement } from 'react'

import type { LibraryItem } from '../../storage'
import { useUserAssetSource } from '../../bridge/react/user-asset-source-context'

import { useActiveTool } from '../tools/active-tool-context'
import { useFurniturePlacement } from '../plan/furniture-placement-context'

import { importFurnitureGlb } from './use-furniture-import'
import { LibraryLauncher } from './library-launcher'

// The connected host for the furniture library launcher, mounted in the tool
// rail. Picking an item arms it and switches to the place-furniture tool so the
// next canvas click drops it; the import button reads a chosen GLB into the
// user's asset source. The list and the user source are provided at app boot;
// without them the panel shows its empty state and import no-ops.
export function LibraryLauncherPanel(): ReactElement {
  const { armItem } = useFurniturePlacement()
  const { setTool } = useActiveTool()
  const userSource = useUserAssetSource()
  const inputRef = useRef<HTMLInputElement>(null)

  const onPick = useCallback(
    (item: LibraryItem) => {
      armItem(item)
      setTool('place-furniture')
    },
    [armItem, setTool],
  )

  const onImport = useCallback(() => {
    inputRef.current?.click()
  }, [])

  const onFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      // Clear the value so re-choosing the same file fires change again.
      event.target.value = ''
      if (file === undefined || userSource === null) {
        return
      }
      void importFurnitureGlb(file, userSource)
    },
    [userSource],
  )

  return (
    <>
      <LibraryLauncher onPick={onPick} onImport={onImport} />
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
