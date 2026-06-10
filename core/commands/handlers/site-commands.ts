import type { LatLong, Obstruction, Site } from '../../model/site'
import type { Project } from '../../model/types'
import type { Command, CommandHandler } from '../command'
import type { CommandRegistry } from '../command-registry'

export const SET_SITE_LOCATION = 'site/set-location'

export interface SetSiteLocationParams {
  latLong: LatLong
}

export function setSiteLocation(latLong: LatLong): Command<SetSiteLocationParams> {
  return { type: SET_SITE_LOCATION, params: { latLong }, description: 'Set site location' }
}

const setSiteLocationHandler: CommandHandler<Project, SetSiteLocationParams> = {
  apply(state, params) {
    // Reassign the whole site slice so the inverse-capture proxy records the
    // root-level change and undo restores the prior reference (including back to
    // an absent site).
    state.site = { ...state.site, latLong: params.latLong }
  },
}

export const SET_SITE_NORTH_BEARING = 'site/set-north-bearing'

export interface SetSiteNorthBearingParams {
  northBearing: number
}

export function setSiteNorthBearing(northBearing: number): Command<SetSiteNorthBearingParams> {
  return {
    type: SET_SITE_NORTH_BEARING,
    params: { northBearing },
    description: 'Set site north bearing',
  }
}

const setSiteNorthBearingHandler: CommandHandler<Project, SetSiteNorthBearingParams> = {
  apply(state, params) {
    state.site = { ...state.site, northBearing: params.northBearing }
  },
}

export const ADD_OBSTRUCTION = 'site/add-obstruction'

export interface AddObstructionParams {
  obstruction: Obstruction
}

export function addObstruction(obstruction: Obstruction): Command<AddObstructionParams> {
  return { type: ADD_OBSTRUCTION, params: { obstruction }, description: 'Add obstruction' }
}

const addObstructionHandler: CommandHandler<Project, AddObstructionParams> = {
  apply(state, params) {
    state.site = {
      ...state.site,
      obstructions: [...(state.site?.obstructions ?? []), params.obstruction],
    }
  },
}

export const REMOVE_OBSTRUCTION = 'site/remove-obstruction'

export interface RemoveObstructionParams {
  id: string
}

export function removeObstruction(id: string): Command<RemoveObstructionParams> {
  return { type: REMOVE_OBSTRUCTION, params: { id }, description: 'Remove obstruction' }
}

const removeObstructionHandler: CommandHandler<Project, RemoveObstructionParams> = {
  apply(state, params) {
    const remaining = (state.site?.obstructions ?? []).filter(
      (obstruction) => obstruction.id !== params.id,
    )
    const rebuilt: Site = { ...state.site }
    // The obstructions list treats an absent value as "none", so collapse an
    // emptied list back to undefined rather than leaving a contract-violating
    // empty array.
    if (remaining.length > 0) {
      rebuilt.obstructions = remaining
    } else {
      delete rebuilt.obstructions
    }
    state.site = rebuilt
  },
}

export function registerSiteCommands(registry: CommandRegistry<Project>): CommandRegistry<Project> {
  return registry
    .register(SET_SITE_LOCATION, setSiteLocationHandler)
    .register(SET_SITE_NORTH_BEARING, setSiteNorthBearingHandler)
    .register(ADD_OBSTRUCTION, addObstructionHandler)
    .register(REMOVE_OBSTRUCTION, removeObstructionHandler)
}
