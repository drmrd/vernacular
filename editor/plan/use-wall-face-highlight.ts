import { useCallback, useEffect } from 'react'
import { useSurfaceSelection } from '../../bridge'

/**
 * Drives the plan's transient face highlight from a selected wall face. While
 * mounted it highlights the selected face and clears the highlight on unmount;
 * the returned handler previews a hovered face (string side) and reverts to the
 * selected face when the pointer leaves the chips (null).
 */
export function useWallFaceHighlight(
  wallId: string,
  side: 'left' | 'right',
): (hovered: string | null) => void {
  const surfaceSelection = useSurfaceSelection()
  useEffect(() => {
    surfaceSelection.highlight({ kind: 'wall-face', wallId, side })
    return () => surfaceSelection.clearHighlight()
  }, [surfaceSelection, wallId, side])
  return useCallback(
    (hovered) => {
      const target = hovered === 'left' || hovered === 'right' ? hovered : side
      surfaceSelection.highlight({ kind: 'wall-face', wallId, side: target })
    },
    [surfaceSelection, wallId, side],
  )
}
