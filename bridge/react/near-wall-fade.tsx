import { useFrame } from '@react-three/fiber'

import {
  restoreNearWallTransparency,
  updateNearWallTransparency,
  type NearWallTarget,
} from '../../engine'

// Fades the prepared exterior walls each frame from the live camera, so a wall the
// camera is outside of turns transparent and the interior shows through it (issue #122).
// It reads the live camera through useFrame rather than reframing, so it never moves the
// camera; it only sets material opacity. The fade runs in orbit only: while walking on the
// floor the camera is inside the building, where fading the surrounding walls would be
// wrong, so each frame restores every wall to its opaque baseline instead (issue #256).
export function NearWallFade({
  targets,
  enabled,
}: {
  targets: NearWallTarget[]
  enabled: boolean
}) {
  useFrame(({ camera }) => {
    if (enabled) updateNearWallTransparency(targets, camera.position)
    else restoreNearWallTransparency(targets)
  })
  return null
}
