import { useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo } from 'react'

import {
  createSelectionOutlineGroup,
  pickEntityIdAt,
  reconcileSelectionOutline,
  type SceneRoot,
} from '../../engine'
import { useSelection, useSelectionIds } from './selection-context'

// A pointer press picks the entity under the cursor and writes the shared bridge
// selection (so the plan reflects it); a modifier press toggles it, and a press on empty
// space clears. The selection outline overlay is reconciled whenever the selection or the
// geometry changes, and lives on the persistent render scene, not the keyed geometry
// group. Coverage-excluded glue, proven by the scene-webgl tier; the pick and outline
// logic are unit-tested in the engine.
export function SceneSelection({ root }: { root: SceneRoot }) {
  const camera = useThree((state) => state.camera)
  const raycaster = useThree((state) => state.raycaster)
  const scene = useThree((state) => state.scene)
  const domElement = useThree((state) => state.gl.domElement)
  const selection = useSelection()
  const selectedIds = useSelectionIds()
  const outlineGroup = useMemo(() => createSelectionOutlineGroup(), [])

  useLayoutEffect(() => {
    scene.add(outlineGroup)
    return () => {
      scene.remove(outlineGroup)
    }
  }, [scene, outlineGroup])

  useLayoutEffect(() => {
    reconcileSelectionOutline(root, selectedIds, outlineGroup)
  }, [root, selectedIds, outlineGroup])

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const rect = domElement.getBoundingClientRect()
      const ndc = {
        x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
      }
      const id = pickEntityIdAt({ raycaster, camera, root, ndc })
      const additive = event.shiftKey || event.metaKey || event.ctrlKey
      if (id === null) {
        if (!additive) selection.clear()
      } else if (additive) {
        selection.toggle(id)
      } else {
        selection.select(id)
      }
    }
    domElement.addEventListener('pointerdown', onPointerDown)
    return () => domElement.removeEventListener('pointerdown', onPointerDown)
  }, [domElement, camera, raycaster, root, selection])

  return null
}
