// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_IMPERIAL_PREFERENCES,
  DEFAULT_METRIC_PREFERENCES,
  deriveSceneGraph,
  formatLength,
  lengthFormatOptions,
} from '../../'
import { createDimension, createEmptyProject, createFloor } from '../../model/factories'
import type { Project } from '../../model/types'
import type { DimensionSceneNode } from '../../scene/scene-graph'
import { SvgPlanExporter } from './svg-plan-exporter'

/** Endpoints of the lone horizontal dimension; 4000mm formats unlike feet-and-inches. */
const DIMENSION_START = { x: 0, y: 0 }
const DIMENSION_END = { x: 4000, y: 0 }
const DIMENSION_OFFSET = 300

/**
 * Build a deterministic project with one floor and a single horizontal dimension,
 * declared in the given units. The geometry is fixed across systems so the only
 * thing the exporter can observe between an imperial and a metric build is
 * `project.meta.units`.
 */
function dimensionProjectInUnits(units: Project['meta']['units']): Project {
  const dimension = createDimension({
    start: DIMENSION_START,
    end: DIMENSION_END,
    offset: DIMENSION_OFFSET,
    id: 'dimension-a',
  })
  const floor = createFloor('Ground Floor', { id: 'floor-a' })
  return {
    ...createEmptyProject({ name: 'House', units, period: 'victorian', appVersion: '0.1.0' }),
    floors: [{ ...floor, dimensions: [dimension] }],
  }
}

/** The sole derived dimension scene node, asserting the fixture produced exactly one. */
function soleDerivedDimension(project: Project): DimensionSceneNode {
  const [node] = deriveSceneGraph(project).dimensions
  if (node === undefined) {
    throw new Error('expected the fixture to derive exactly one dimension')
  }
  return node
}

/** The text content of every `<text>` node in an exported plan. */
function exportedLabels(project: Project): (string | null)[] {
  const content = new SvgPlanExporter().export(project).content
  const document = new DOMParser().parseFromString(content, 'image/svg+xml')
  return [...document.querySelectorAll('text')].map((text) => text.textContent)
}

describe('SvgPlanExporter labeling in project units', () => {
  it("labels the dimension length in the project's units rather than always metric", () => {
    const project = dimensionProjectInUnits('imperial')
    const node = soleDerivedDimension(project)
    const imperialLabel = formatLength(
      node.length,
      lengthFormatOptions(DEFAULT_IMPERIAL_PREFERENCES),
    )
    const metricLabel = formatLength(node.length, lengthFormatOptions(DEFAULT_METRIC_PREFERENCES))
    expect(imperialLabel).not.toBe(metricLabel)

    const labels = exportedLabels(project)

    expect(labels).toContain(imperialLabel)
    expect(labels).not.toContain(metricLabel)
  })
})
