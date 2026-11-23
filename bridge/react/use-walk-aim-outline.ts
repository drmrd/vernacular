import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useState } from 'react'
import { createAimOutlineGroup, reconcileAimOutline } from '../../engine'
import { aimFromWalk } from './walk-aim'
import type { WalkRefs } from './walk-session'

type AimOutlineGroup = ReturnType<typeof createAimOutlineGroup>

export interface WalkAimOutlineInputs extends Pick<WalkRefs, 'state' | 'openings' | 'openness'> {
  floorElevationMm: number
}

// Makes the outline group once and keeps it on the persistent scene, never on the rebuilt root.
export function useWalkAimOutlineGroup(): AimOutlineGroup {
  const scene = useThree((state) => state.scene)
  const [group] = useState(createAimOutlineGroup)
  useLayoutEffect(() => {
    scene.add(group)
    return () => {
      scene.remove(group)
      // null frees the line's geometry and material
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
        walk: inputs.state.current,
        openings: inputs.openings.current,
        openness: inputs.openness.current,
        floorElevationMm: inputs.floorElevationMm,
      })
    : null
  reconcileAimOutline(group, aim?.outline ?? null)
}
