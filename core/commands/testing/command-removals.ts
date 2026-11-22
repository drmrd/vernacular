// The probed objects that each sampled command removes from the extensions
// fixture, named as the test names them: the type and id of an object with an
// id, and the path from its owner for a nested object without one. A command
// that is not listed here removes nothing. A probed object that goes missing
// and is not declared here fails the test and is named in its message.

import * as dimensions from '../handlers/dimension-commands'
import * as scenes from '../handlers/environment-scene-commands'
import * as lights from '../handlers/opening-light-commands'
import * as openings from '../handlers/opening-commands'
import * as palettes from '../handlers/palette-commands'
import * as projects from '../handlers/project-commands'
import * as stairs from '../handlers/stair-commands'
import * as transforms from '../handlers/transform-commands'
import * as underlays from '../handlers/underlay-commands'
import { FIXTURE_IDS } from './extensions-fixture'

const ids = FIXTURE_IDS

/** Identities of the probed objects removed by each command type, keyed by command type. */
export const REMOVED_OBJECTS: Readonly<Record<string, readonly string[]>> = {
  [projects.REMOVE_FLOOR]: [`Floor#${ids.upperFloor}`],
  [stairs.REMOVE_STAIR]: [`Stair#${ids.spareStair}`],
  [palettes.REMOVE_PROJECT_PALETTE]: [`ProjectPalette#${ids.sparePalette}`],
  [scenes.REMOVE_ENVIRONMENT_SCENE]: [
    `EnvironmentScene#${ids.spareScene}`,
    `EnvironmentScene#${ids.spareScene}/weather`,
  ],
  [underlays.REMOVE_UNDERLAY]: [`Underlay#${ids.spareUnderlay}`],
  [openings.REMOVE_OPENING]: [`Opening#${ids.sideOpening}`],
  // The opening light is a root key of the project, so its identity is its path.
  [lights.CLEAR_OPENING_LIGHT]: ['Project/openingLight'],
  [dimensions.REMOVE_DIMENSION]: [`Dimension#${ids.spareDimension}`],
  // Deleting the side wall also deletes the opening hosted by it.
  [transforms.DELETE_ENTITIES]: [`Wall#${ids.sideWall}`, `Opening#${ids.sideOpening}`],
}
