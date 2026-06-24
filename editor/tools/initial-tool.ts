import type { Project } from '../../core'
import { DEFAULT_TOOL, type ToolId } from './active-tool-context'

export function initialToolForProject(project: Project): ToolId {
  const isEmpty = project.floors.every((floor) => floor.walls.length === 0)
  return isEmpty ? 'draw-wall' : DEFAULT_TOOL
}
