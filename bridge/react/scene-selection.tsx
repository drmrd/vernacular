import { useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo } from 'react'

import {
  createSelectionOutlineGroup,
  pickEntityIdAt,
  reconcileSelectionOutline,
  type SceneRoot,
} from '../../engine'
import { isClick, type PointerPoint } from './pointer-click'
import { useSelection, useSelectionIds } from './selection-context'

// A pointer click selects the entity under the cursor and writes the shared bridge
// selection (so the plan reflects it); a modifier click toggles it, and a click on empty
// space clears. Selection commits on pointer release, and only when the press and release
// land within the click tolerance, so a drag to orbit or pan the camera does not select
// whatever sat under the press. The selection outline overlay is reconciled whenever the
// selection or the geometry changes, and lives on the persistent render scene, not the
// keyed geometry group. Coverage-excluded glue, proven by the scene-webgl tier; the pick,
// the click discriminator, and the outline logic are unit-tested.

// A drag of more than a few pixels is a camera move, not a selection click.
const CLICK_TOLERANCE_PX = 6

// pickEntityIdAt's argument carries the three camera and raycaster types, so reusing them
// here keeps this bridge module free of a direct three import (engine owns three).
type PickContext = Parameters<typeof pickEntityIdAt>[0]

interface PointerSelectionDeps {
  domElement: HTMLCanvasElement
  camera: PickContext['camera']
  raycaster: PickContext['raycaster']
  root: SceneRoot
  selection: ReturnType<typeof useSelection>
}

// Picks the entity under the release point and writes the shared selection: a modifier
// click toggles, a plain click selects, and a click on empty space clears.
function commitSelectionAt(event: PointerEvent, deps: PointerSelectionDeps): void {
  const { domElement, camera, raycaster, root, selection } = deps
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

// Commits a selection on pointer release only when the press and release land within the
// click tolerance, so a drag to orbit or pan the camera is a camera move, not a pick. When
// selection is disabled (walk mode), the click-to-select listeners are not attached, so a
// walk-mode click engages pointer lock for mouse-look only and never commits a pick.
function useScenePointerSelection(deps: PointerSelectionDeps, enabled: boolean): void {
  const { domElement } = deps
  useEffect(() => {
    if (!enabled) return
    let pressedAt: PointerPoint | null = null
    function onPointerDown(event: PointerEvent) {
      pressedAt = { x: event.clientX, y: event.clientY }
    }
    function onPointerUp(event: PointerEvent) {
      const down = pressedAt
      pressedAt = null
      if (down === null) return
      const up = { x: event.clientX, y: event.clientY }
      if (isClick(down, up, CLICK_TOLERANCE_PX)) commitSelectionAt(event, deps)
    }
    domElement.addEventListener('pointerdown', onPointerDown)
    domElement.addEventListener('pointerup', onPointerUp)
    return () => {
      domElement.removeEventListener('pointerdown', onPointerDown)
      domElement.removeEventListener('pointerup', onPointerUp)
    }
  }, [domElement, deps, enabled])
}

export function SceneSelection({ root, enabled = true }: { root: SceneRoot; enabled?: boolean }) {
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

  const pointerDeps = useMemo<PointerSelectionDeps>(
    () => ({ domElement, camera, raycaster, root, selection }),
    [domElement, camera, raycaster, root, selection],
  )
  useScenePointerSelection(pointerDeps, enabled)

  return null
}
