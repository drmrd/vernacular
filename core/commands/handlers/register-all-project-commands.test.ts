import { describe, expect, it } from 'vitest'
import { CommandRegistry } from '../command-registry'
import type { Project } from '../../model/types'
import { registerAllProjectCommands } from './register-all-project-commands'
import { ADD_DIMENSION } from './dimension-commands'
import { ADD_ENVIRONMENT_SCENE } from './environment-scene-commands'
import { MARK_MAIN_ENTRANCE } from './entrance-commands'
import { PLACE_FURNITURE } from './furniture-commands'
import { PLACE_OPENING } from './opening-commands'
import { SET_OPENING_LIGHT } from './opening-light-commands'
import { ASSIGN_SURFACE_TREATMENT } from './paint-commands'
import { CREATE_PROJECT_PALETTE } from './palette-commands'
import { RENAME_PROJECT } from './project-commands'
import { SET_ROOM_NAME } from './room-commands'
import { SET_SITE_LOCATION } from './site-commands'
import { ADD_STAIR } from './stair-commands'
import { TRANSLATE_ENTITIES } from './transform-commands'
import { PLACE_UNDERLAY } from './underlay-commands'
import { ADD_WALL } from './wall-commands'

const REGISTERED_COMMAND_COUNT = 72

const ONE_COMMAND_PER_HANDLER_FILE: readonly (readonly [string, string])[] = [
  ['dimension-commands', ADD_DIMENSION],
  ['environment-scene-commands', ADD_ENVIRONMENT_SCENE],
  ['entrance-commands', MARK_MAIN_ENTRANCE],
  ['furniture-commands', PLACE_FURNITURE],
  ['opening-commands', PLACE_OPENING],
  ['opening-light-commands', SET_OPENING_LIGHT],
  ['paint-commands', ASSIGN_SURFACE_TREATMENT],
  ['palette-commands', CREATE_PROJECT_PALETTE],
  ['project-commands', RENAME_PROJECT],
  ['room-commands', SET_ROOM_NAME],
  ['site-commands', SET_SITE_LOCATION],
  ['stair-commands', ADD_STAIR],
  ['transform-commands', TRANSLATE_ENTITIES],
  ['underlay-commands', PLACE_UNDERLAY],
  ['wall-commands', ADD_WALL],
]

describe('registerAllProjectCommands', () => {
  it('registers every project command, none twice', () => {
    const registry = registerAllProjectCommands(new CommandRegistry<Project>())

    expect(registry.types()).toHaveLength(REGISTERED_COMMAND_COUNT)
    expect(new Set(registry.types()).size).toBe(REGISTERED_COMMAND_COUNT)
  })

  it.each(ONE_COMMAND_PER_HANDLER_FILE)('has a handler for a command from %s', (_file, type) => {
    const registry = registerAllProjectCommands(new CommandRegistry<Project>())

    expect(registry.handlerFor(type)).toBeDefined()
  })
})
