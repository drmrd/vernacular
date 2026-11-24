import { useLayoutEffect, useState } from 'react'

import type { SceneRoot } from '../../engine'
import { refreshGroundPlane } from './framed-scene'
import type { TextureState, TextureStatus } from './texture-cache'

interface AppliedGround {
  root: SceneRoot
  status: TextureStatus
}

/**
 * Returns the texture status applied to the drawn root, so `ready` comes only in a commit after
 * the plane was swapped.
 */
export function useHarnessGround(
  root: SceneRoot,
  gradeElevation: number | undefined,
  texture: TextureState,
): TextureStatus {
  const [applied, setApplied] = useState<AppliedGround | null>(null)
  const { appearance, status } = texture
  useLayoutEffect(() => {
    refreshGroundPlane(root, { gradeElevation, appearance })
    setApplied({ root, status })
  }, [root, gradeElevation, appearance, status])
  // The gate compares only the root and the status, so an appearance or grade change on the same
  // root goes unseen; the harness never makes one, as its grass and fixture grade stay fixed.
  return applied?.root === root && applied.status === status ? status : 'loading'
}
