import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'

import { cameraOutsideBuilding, type Point, type Vector3 } from '../../core'
import {
  restoreNearWallTransparency,
  restoreUnenrolledNearWallTargets,
  updateNearWallTransparency,
  type NearWallTarget,
} from '../../engine'

/**
 * The slice of the framed scene the fade decision reads: the room outlines and the
 * building's top elevation. Kept as one named shape so the pure predicate and the
 * component's props cannot drift apart.
 */
type FadeGeometry = {
  roomPolygons: readonly (readonly Point[])[]
  buildingTopWorld?: number | undefined
}

/**
 * Reports whether the orbit camera counts as outside the building, so the near-wall
 * fade should engage: a thin wrapper over core's cameraOutsideBuilding that reads the
 * room outlines and building top elevation off the framed scene's shape rather than
 * taking them as separate positional arguments (issue #609).
 */
// eslint-disable-next-line react-refresh/only-export-components -- the pure predicate ships beside the component that calls it each frame and this slice's test imports fadeCameraOutside from ./near-wall-fade.
export function fadeCameraOutside(cameraWorld: Vector3, framed: FadeGeometry): boolean {
  return cameraOutsideBuilding(cameraWorld, framed.roomPolygons, framed.buildingTopWorld)
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
  buildingTopWorld,
}: FadeGeometry & {
  targets: NearWallTarget[]
  enabled: boolean
}) {
  // The set this component last drove, so a rebuild that drops a wall can be seen here.
  const previousTargets = useRef(targets)
  useFrame(({ camera }) => {
    restoreUnenrolledNearWallTargets(previousTargets.current, targets)
    previousTargets.current = targets
    if (enabled && fadeCameraOutside(camera.position, { roomPolygons, buildingTopWorld })) {
      updateNearWallTransparency(targets, camera.position)
    } else {
      restoreNearWallTransparency(targets)
    }
  })
  return null
}
