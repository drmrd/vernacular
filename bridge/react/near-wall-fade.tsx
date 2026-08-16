import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'

import { cameraOutsideBuilding, type Point } from '../../core'
import {
  restoreNearWallTransparency,
  updateNearWallTransparency,
  type NearWallTarget,
} from '../../engine'

/**
 * Restores the targets a shrinking enrollment set left behind. Enrollment keys on the
 * exterior wall set, so an edit that changes room topology can reclassify a wall from
 * exterior to interior while it is mid-fade. The wall then drops out of the set with its
 * materials still at the fade opacity, and no later frame reaches them, since every update
 * and restore runs over the current set. Sweeping what left the set before tracking is
 * dropped puts those materials back on their baseline (issue #526).
 */
// eslint-disable-next-line react-refresh/only-export-components -- the pure sweep ships beside the component that runs it each frame and this slice's test imports restoreUnenrolledNearWallTargets from ./near-wall-fade.
export function restoreUnenrolledNearWallTargets(
  previous: NearWallTarget[],
  current: NearWallTarget[],
): void {
  if (previous === current) {
    return
  }
  // A rebuild hands back fresh target objects over reused materials, so what survived
  // enrollment is read off the material instances rather than off target identity.
  const stillEnrolled = new Set(
    current.flatMap((target) => target.materials.map((record) => record.material)),
  )
  restoreNearWallTransparency(
    previous.map((target) => ({
      ...target,
      materials: target.materials.filter((record) => !stillEnrolled.has(record.material)),
    })),
  )
}

// Fades the prepared exterior walls each frame from the live camera, so a wall the
// camera is outside of turns transparent and the interior shows through it (issue #122).
// It reads the live camera through useFrame rather than reframing, so it never moves the
// camera; it only sets material opacity. The fade runs in orbit only: while walking on the
// floor the camera is inside the building, where fading the surrounding walls would be
// wrong, so each frame restores every wall to its opaque baseline instead (issue #256).
// The same reasoning holds for an orbit camera dollied inside the footprint, so the fade
// also stands down whenever the live camera sits inside a room outline (issue #256).
export function NearWallFade({
  targets,
  enabled,
  roomPolygons,
}: {
  targets: NearWallTarget[]
  enabled: boolean
  roomPolygons: readonly (readonly Point[])[]
}) {
  // The set this component last drove, so a rebuild that drops a wall can be seen here.
  const enrolled = useRef(targets)
  useFrame(({ camera }) => {
    restoreUnenrolledNearWallTargets(enrolled.current, targets)
    enrolled.current = targets
    if (enabled && cameraOutsideBuilding(camera.position, roomPolygons)) {
      updateNearWallTransparency(targets, camera.position)
    } else {
      restoreNearWallTransparency(targets)
    }
  })
  return null
}
