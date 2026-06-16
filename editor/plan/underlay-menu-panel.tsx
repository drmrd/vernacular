import type { Command } from '../../core'
import { useActiveFloorId, useEditorSession, useSceneGraph } from '../../bridge'
import { UnderlayMenu } from './underlay-menu'
import { useUnderlay } from './use-underlay'

// The connected host for the underlay launcher, mounted in the tool rail. It
// resolves the active floor and wires the underlay context's loader and
// calibration into the presentational UnderlayMenu flyout.
export function UnderlayMenuPanel() {
  const session = useEditorSession()
  const activeFloorId = useActiveFloorId()
  const underlay = useUnderlay()
  useSceneGraph()
  const project = session.getProject()
  const floor =
    project.floors.find((candidate) => candidate.id === activeFloorId) ?? project.floors[0]
  if (floor === undefined) {
    return null
  }
  return (
    <UnderlayMenu
      floorId={floor.id}
      underlays={floor.underlays}
      dispatch={(command) => session.dispatch(command as Command)}
      onLoadImage={underlay.loadImage}
      onCalibrate={underlay.startCalibration}
    />
  )
}
