// @vitest-environment node
// readLayerSources reads the layer directories through Node's fs module, which needs the node environment, not the project-wide jsdom.
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readLayerSources } from './import-graph'
import { OTHER_DISTANCES } from './other-distances'
import { constDeclarations, findGeometricTolerances } from './tolerance-scan-test-support'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))

const SOURCE_SCAN_TIMEOUT_MS = 30_000

const OTHER_DISTANCE_NAMES: readonly string[] = [
  'ASPECT_TOLERANCE',
  'CLICK_TOLERANCE_PX',
  'COLOR_ACCURACY_TOLERANCE',
  'DEFAULT_HIT_TOLERANCE_MM',
  'MARQUEE_DRAG_THRESHOLD_MM',
  'MITER_LIMIT',
  'PITCH_LIMIT_EPSILON_RAD',
  'SLAB_SIDE_FACE_INSET_MM',
  'SNAP_PIXEL_TOLERANCE',
  'TONE_MAP_EXTREME_TOLERANCE',
  'WALL_ATTACHMENT_TOLERANCE_MM',
  'ZENITH_ALIGNMENT_COSINE_EPSILON',
]

type PlantedFile = readonly [path: string, text: string]

function scan(...files: PlantedFile[]): string[] {
  return findGeometricTolerances(new Map(files))
}

describe('the scan for geometric tolerances', () => {
  it('names a planted const called with EPSILON outside the module', () => {
    expect(scan(['core/geometry/sample.ts', 'const SAMPLE_EPSILON = 2\n'])).toEqual([
      'core/geometry/sample.ts: SAMPLE_EPSILON',
    ])
  })

  it('names a planted comparison with an exponent literal', () => {
    const source = 'export const near = (d: number) => d < 1e-9\n'

    expect(scan(['editor/sample.ts', source])).toEqual(['editor/sample.ts: 1e-9'])
  })

  it('names a planted numeric const below 1e-3 in a geometry folder', () => {
    expect(scan(['core/topology/sample.ts', 'const STEP_MM = 0.0005\n'])).toEqual([
      'core/topology/sample.ts: STEP_MM',
    ])
  })

  it('passes a zero, and a small const outside the geometry folders', () => {
    expect(
      scan(
        ['core/scene/sample.ts', 'const ORIGIN_MM = 0\n'],
        ['editor/plan/sample.ts', 'const STEP_MM = 0.0005\n'],
      ),
    ).toEqual([])
  })

  it('passes the tolerance module and test files', () => {
    const source = 'const X_EPSILON = 1e-9\n'

    expect(
      scan(['core/geometry/tolerance.ts', source], ['core/geometry/sample.test.ts', source]),
    ).toEqual([])
  })
})

describe('the tolerance module as the one home of geometric tolerances', () => {
  const sources = readLayerSources(repositoryRoot)

  it(
    'finds every geometric tolerance in the tolerance module or on the list of other distances',
    { timeout: SOURCE_SCAN_TIMEOUT_MS },
    () => {
      const listed = OTHER_DISTANCES.map((distance) => `${distance.file}: ${distance.name}`)

      const outside = findGeometricTolerances(sources).filter(
        (finding) => !listed.includes(finding),
      )

      expect(outside).toEqual([])
    },
  )

  it(
    'finds each entry of the list of other distances declared at its file',
    { timeout: SOURCE_SCAN_TIMEOUT_MS },
    () => {
      const missing = OTHER_DISTANCES.filter((distance) => {
        const text = sources.get(distance.file) ?? ''
        return !constDeclarations(distance.file, text).some(({ name }) => name === distance.name)
      }).map((distance) => `${distance.file}: ${distance.name}`)

      expect(missing).toEqual([])
    },
  )

  it('lists the other distances of the specification and no more', () => {
    expect(OTHER_DISTANCES.map((distance) => distance.name).sort()).toEqual(OTHER_DISTANCE_NAMES)
  })
})
