import type { OpeningLight, ViewingConditions } from '../../model/environment-scene'
import type { Project } from '../../model/types'
import type { Command, CommandHandler } from '../command'
import type { CommandRegistry } from '../command-registry'

export const SET_OPENING_LIGHT = 'opening-light/set'

export interface SetOpeningLightParams {
  readonly light: ViewingConditions
}

export function setOpeningLight(light: ViewingConditions): Command<SetOpeningLightParams> {
  return { type: SET_OPENING_LIGHT, params: { light }, description: 'Set opening light' }
}

const setOpeningLightHandler: CommandHandler<Project, SetOpeningLightParams> = {
  apply(state, params) {
    // Keep every key of the replaced record except the time and the weather, so
    // `extensions` and unknown keys survive; the new weather is added only when given.
    const next: OpeningLight = { ...state.openingLight, observedAt: params.light.observedAt }
    delete next.weather
    if (params.light.weather) {
      next.weather = params.light.weather
    }
    state.openingLight = next
  },
}

export const CLEAR_OPENING_LIGHT = 'opening-light/clear'

export function clearOpeningLight(): Command<Record<string, never>> {
  return { type: CLEAR_OPENING_LIGHT, params: {}, description: 'Clear opening light' }
}

const clearOpeningLightHandler: CommandHandler<Project, Record<string, never>> = {
  apply(state) {
    delete state.openingLight
  },
}

export function registerOpeningLightCommands(
  registry: CommandRegistry<Project>,
): CommandRegistry<Project> {
  return registry
    .register(SET_OPENING_LIGHT, setOpeningLightHandler)
    .register(CLEAR_OPENING_LIGHT, clearOpeningLightHandler)
}
