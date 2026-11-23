import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, type RefObject } from 'react'
import type { OpeningSceneNode, WalkState } from '../../core'
import { createAimOutlineGroup, reconcileAimOutline } from '../../engine'
import { aimFromWalk } from './walk-aim'
import type { OpeningMotionRefs } from './use-opening-motion'

type AimOutlineGroup = ReturnType<typeof createAimOutlineGroup>

export interface WalkAimOutlineInputs {
  walk: RefObject<WalkState>
  openings: RefObject<OpeningSceneNode[]>
  openness: OpeningMotionRefs['openness']
  floorElevationMm: number
}

// Makes the outline group once and keeps it on the persistent scene, never on the rebuilt root.
export function useWalkAimOutlineGroup(): AimOutlineGroup {
  const scene = useThree((state) => state.scene)
  const group = useMemo(() => createAimOutlineGroup(), [])
  useLayoutEffect(() => {
    scene.add(group)
    return () => {
      scene.remove(group)
      reconcileAimOutline(group, null)
    }
  }, [scene, group])
  return group
}

// Shows the outline of what the interact key would act on, or clears it when the guide is off.
export function stepWalkAimOutline(
  group: AimOutlineGroup,
  inputs: WalkAimOutlineInputs,
  shown: boolean,
): void {
  const aim = shown
    ? aimFromWalk({
        walk: inputs.walk.current,
        openings: inputs.openings.current,
        openness: inputs.openness.current,
        floorElevationMm: inputs.floorElevationMm,
      })
    : null
  reconcileAimOutline(group, aim === null ? null : aim.outline)
}
