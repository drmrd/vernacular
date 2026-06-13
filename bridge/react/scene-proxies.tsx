import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'

import { entityScreenPositions, type EntityScreenPosition, type SceneRoot } from '../../engine'

// Projects the scene's entity anchors to screen pixels every frame through the live camera
// and reports them up when an integer pixel position changes, so the DOM proxy overlay (a
// sibling of the canvas) can place its options. Runs inside the R3F canvas because it needs
// the live camera and canvas size; coverage-excluded glue, proven by the scene-webgl tier.
// At rest the projected positions are stable, so it does not churn React; only camera motion
// triggers an update.
export function SceneProxyProjector({
  root,
  onPositions,
}: {
  root: SceneRoot
  onPositions: (positions: EntityScreenPosition[]) => void
}) {
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const lastKey = useRef('')

  useFrame(() => {
    const positions = entityScreenPositions(root, camera, {
      width: size.width,
      height: size.height,
    })
    const key = positions.map((p) => `${p.id}:${Math.round(p.x)}:${Math.round(p.y)}`).join('|')
    if (key !== lastKey.current) {
      lastKey.current = key
      onPositions(positions)
    }
  })

  return null
}
