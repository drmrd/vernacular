import { useLayoutEffect, useRef } from 'react'

import { FURNITURE_NODE_PREFIX } from '../../core'
import type { SceneRoot } from '../../engine'
import { e2eRuntimeFlagSet } from './e2e-runtime-flag'

// The raw entity ids of furniture groups now showing their real model: a furniture-named group
// whose subtree has a mesh and is not flagged as a placeholder massing box. The massing box sets
// userData.furnitureMassing (buildFurnitureMassing); the swapped-in model group never does. (The
// box edge overlay used to mark the box, but it is now an opt-in view toggle, off by default per
// ADR-0132, so the placeholder flag is the stable signal instead.)
function loadedFurnitureEntityIds(root: SceneRoot): string[] {
  const ids: string[] = []
  root.traverse((object) => {
    if (!object.name.startsWith(FURNITURE_NODE_PREFIX)) return
    const hasMesh = object.getObjectByProperty('isMesh', true) !== undefined
    const isMassingBox = object.userData.furnitureMassing === true
    if (hasMesh && !isMassingBox) ids.push(String(object.userData.entityId))
  })
  return ids
}

/**
 * Writes a hidden DOM signal after each committed swap so the end-to-end test can wait on a real
 * model swap without racing the network: it sets `data-model-loaded-<id>` on a hidden element for
 * every furniture piece now showing its model. The attribute is written imperatively in a layout
 * effect keyed on the built root and the model version, and the element is kept out of the
 * accessibility proxy so it never re-renders that tree. It renders nothing unless the `?e2e`
 * runtime flag is set, so it is inert in normal use.
 */
export function FurnitureModelSignals({ root, version }: { root: SceneRoot; version: number }) {
  const enabled = e2eRuntimeFlagSet(window.location.search)
  const signalRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!enabled) return
    const element = signalRef.current
    if (element === null) return
    for (const id of loadedFurnitureEntityIds(root)) {
      element.setAttribute(`data-model-loaded-${id}`, 'true')
    }
  }, [root, version, enabled])
  if (!enabled) return null
  return <div ref={signalRef} hidden data-testid="furniture-model-signals" />
}
