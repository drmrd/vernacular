import type { Project } from '../../model/types'
import { SvgPlanExporter } from './svg-plan-exporter'

/** A drawing of the first floor with no text, as SVG text; undefined for a project with no floor. */
export function createPlanPreview(project: Project): string | undefined {
  const firstFloor = project.floors[0]
  if (firstFloor === undefined) {
    return undefined
  }
  return new SvgPlanExporter().export(project, { floorIds: [firstFloor.id], annotations: false })
    .content
}
