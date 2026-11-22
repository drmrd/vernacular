import type { ReactNode } from 'react'
import { sceneReadinessProps, sceneRevisionProps } from './scene-readiness'

// The wrapper carries the shared readiness props (scene-readiness.ts) so the editor
// pane's observer can tell, from outside the bridge layer, when the canvas inside has
// drawn its first frame. It fills its flex-item parent the same way React Three
// Fiber's own Canvas wrapper div would if it were the direct child here.
export function SceneReadinessBoundary({
  sceneRevision,
  drawnRevision,
  children,
}: {
  sceneRevision: number
  drawnRevision: number | null
  children: ReactNode
}) {
  return (
    <div
      style={{ width: '100%', height: '100%' }}
      {...sceneReadinessProps(drawnRevision !== null)}
      {...sceneRevisionProps({ sceneRevision, drawnRevision })}
    >
      {children}
    </div>
  )
}
