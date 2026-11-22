import type { Project } from '../../model/types'
import type { CommandRegistry } from '../command-registry'
import { registerDimensionCommands } from './dimension-commands'
import { registerEntranceCommands } from './entrance-commands'
import { registerEnvironmentSceneCommands } from './environment-scene-commands'
import { registerFurnitureCommands } from './furniture-commands'
import { registerOpeningCommands } from './opening-commands'
import { registerOpeningLightCommands } from './opening-light-commands'
import { registerPaintCommands } from './paint-commands'
import { registerPaletteCommands } from './palette-commands'
import { registerProjectCommands } from './project-commands'
import { registerRoomCommands } from './room-commands'
import { registerSiteCommands } from './site-commands'
import { registerStairCommands } from './stair-commands'
import { registerTransformCommands } from './transform-commands'
import { registerUnderlayCommands } from './underlay-commands'
import { registerWallCommands } from './wall-commands'

export function registerAllProjectCommands(
  registry: CommandRegistry<Project>,
): CommandRegistry<Project> {
  registerProjectCommands(registry)
  registerPaletteCommands(registry)
  registerWallCommands(registry)
  registerRoomCommands(registry)
  registerUnderlayCommands(registry)
  registerOpeningCommands(registry)
  registerFurnitureCommands(registry)
  registerDimensionCommands(registry)
  registerStairCommands(registry)
  registerTransformCommands(registry)
  registerPaintCommands(registry)
  registerSiteCommands(registry)
  registerEnvironmentSceneCommands(registry)
  registerEntranceCommands(registry)
  registerOpeningLightCommands(registry)
  return registry
}
