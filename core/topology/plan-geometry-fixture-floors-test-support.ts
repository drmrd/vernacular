import {
  versionFixtureBytes,
  VERSION_FIXTURE_VERSIONS,
} from '../../tests/fixtures/projects/versions'
import corpusCottage from '../../tests/fixtures/projects/corpus/01-radford-1908-design-5054-tiny-square-cottage.vernacular.json?raw'
import corpusPrairie from '../../tests/fixtures/projects/corpus/15-gb-cooley-house-prairie-school-second-floor-plan.vernacular.json?raw'
import corpusRanch from '../../tests/fixtures/projects/corpus/18-usda-plan-7156-two-bedroom-ranch-with-carport.vernacular.json?raw'
import corpusParking from '../../tests/fixtures/projects/corpus/21-modern-cad-line-plan-30x35-parking-three-rooms.vernacular.json?raw'
import corpusCastle from '../../tests/fixtures/projects/corpus/27-chateau-de-pierrefonds-castle-turret-curved-walls-plan.vernacular.json?raw'
import minimalProject from '../../tests/fixtures/projects/minimal.vernacular.json?raw'
import twoFloorCottage from '../../tests/fixtures/projects/two-floor-cottage.vernacular.json?raw'
import { createReferenceProject } from '../../tests/performance/reference-project'
import { decodeDocument } from '../format/codec/decode-document'
import type { Floor } from '../model/types'
import { counterClockwiseWalls } from '../scene/opening-room-side-test-fixtures'
import { furnishedGroundFloor } from '../scene/scene-graph-parity-fixtures'
import {
  centeredEllFloor,
  centeredPartitionFloor,
  courtyardFloor,
  flushEllFloor,
  linkedShaftFloor,
  longNorthWallFloor,
  offCenterPartitionFloor,
} from '../scene/wall-runs-test-fixtures'
import { roomFixtureFloors } from './room-fixtures-test-support'
import type { FixtureFloor } from './room-fixtures-test-support'

export type { FixtureFloor }

interface ProjectSource {
  readonly label: string
  readonly bytes: Uint8Array
}

const encoder = new TextEncoder()

function textSource(label: string, text: string): ProjectSource {
  return { label, bytes: encoder.encode(text) }
}

function storedProjectSources(): ProjectSource[] {
  return [
    textSource('minimal', minimalProject),
    textSource('two-floor-cottage', twoFloorCottage),
    textSource('corpus/01-radford-1908', corpusCottage),
    textSource('corpus/15-gb-cooley-house', corpusPrairie),
    textSource('corpus/18-usda-plan-7156', corpusRanch),
    textSource('corpus/21-modern-cad-line-plan', corpusParking),
    textSource('corpus/27-chateau-de-pierrefonds', corpusCastle),
    ...VERSION_FIXTURE_VERSIONS.map((version) => ({
      label: `versions/v${version}`,
      bytes: versionFixtureBytes(version),
    })),
  ]
}

function floorsNamed(prefix: string, floors: readonly Floor[]): FixtureFloor[] {
  return floors.map((floor, index) => ({
    name: `${prefix} floor ${index + 1}`,
    walls: floor.walls,
  }))
}

function projectFloors(): FixtureFloor[] {
  return storedProjectSources().flatMap((source) => {
    const decoded = decodeDocument(source.bytes)
    if (!decoded.ok) {
      throw new Error(`the stored project ${source.label} does not decode: ${decoded.failure.kind}`)
    }
    return floorsNamed(`project: ${source.label}`, decoded.value.project.floors)
  })
}

function sceneFloors(): FixtureFloor[] {
  const floorsByName: ReadonlyArray<readonly [string, Floor]> = [
    ['long north wall floor', longNorthWallFloor()],
    ['centered partition floor', centeredPartitionFloor()],
    ['off-center partition floor', offCenterPartitionFloor()],
    ['centered ell floor', centeredEllFloor()],
    ['flush ell floor', flushEllFloor()],
    ['courtyard floor', courtyardFloor()],
    ['linked shaft floor', linkedShaftFloor()],
    ['furnished ground floor', furnishedGroundFloor()],
  ]
  return floorsByName.map(([name, floor]) => ({ name: `scene: ${name}`, walls: floor.walls }))
}

/**
 * Every floor the parity test compares: the scene fixtures, the opening-side room, the room
 * fixtures of the topology tests, the stored projects and their versions, and the reference
 * project. Fresh on each call.
 */
export function fixtureFloors(): readonly FixtureFloor[] {
  return [
    ...sceneFloors(),
    { name: 'scene: counter-clockwise opening room', walls: counterClockwiseWalls() },
    ...roomFixtureFloors(),
    ...projectFloors(),
    ...floorsNamed('reference project', createReferenceProject().floors),
  ]
}
