import type { Project } from '../../core'
import { DEFAULT_TOOL, type ToolId } from './tool-types'

export function initialToolForProject(project: Project): ToolId {
  const hasNoWalls = project.floors.every((floor) => floor.walls.length === 0)
  return hasNoWalls ? 'draw-wall' : DEFAULT_TOOL
}
